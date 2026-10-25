/** SigV4 against the worked examples in AWS's S3 documentation (docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-*). */
import { describe, expect, it } from "vitest";
import { presignUrl, sha256Hex, signHeaders, encodePath } from "../src/lib/sigv4.js";

const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };
const now = new Date("2013-05-24T00:00:00Z");

describe("sigv4", () => {
  it("presigned GET matches the AWS query-string example", () => {
    const url = presignUrl(creds, { method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", now, expiresInSeconds: 86400 });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("header signing matches the AWS GET Object (Range) example", () => {
    const h = signHeaders(creds, { method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", now, payloadHash: sha256Hex(""), headers: { range: "bytes=0-9" } });
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(h["x-amz-date"]).toBe("20130524T000000Z");
    expect(h.host).toBeUndefined();
  });

  it("header signing matches the AWS PUT Object example (encoded key, body hash, extra header)", () => {
    const h = signHeaders(creds, {
      method: "PUT",
      host: "examplebucket.s3.amazonaws.com",
      path: `/${encodePath("test$file.text")}`,
      now,
      payloadHash: sha256Hex("Welcome to Amazon S3."),
      headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
    });
    expect(h.authorization).toContain("SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class");
    expect(h.authorization).toContain("Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });

  it("clamps expiry to 1 second..7 days and signs query parameters in sorted order", () => {
    const long = new URL(presignUrl(creds, { method: "GET", host: "h.test", path: "/b/k", now, expiresInSeconds: 9_999_999 }));
    expect(long.searchParams.get("X-Amz-Expires")).toBe("604800");
    expect(new URL(presignUrl(creds, { method: "GET", host: "h.test", path: "/b/k", now, expiresInSeconds: -5 })).searchParams.get("X-Amz-Expires")).toBe("1");
    const a = presignUrl(creds, { method: "GET", host: "h.test", path: "/b/k", now, expiresInSeconds: 60, query: { "response-content-type": "image/png", a: "1" } });
    const keys = [...new URL(a).searchParams.keys()];
    expect(keys).toEqual(["X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires", "X-Amz-SignedHeaders", "a", "response-content-type", "X-Amz-Signature"]);
  });
});
