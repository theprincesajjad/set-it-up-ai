"use client";
import { Meter, PageHeader, Panel, StatusPill, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { browserApi } from "@/lib/api/browser";
import { PAGE_LABEL, STATUS_LABEL, STATUS_TONE, METRIC_LABEL } from "@/lib/dashboard/experiments";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

/** The pre-registered landing tests (packages/shared/src/experiments.ts) and how far each is toward its horizon. */
export default function ExperimentsPage() {
  const list = useApi(() => browserApi.admin.experiments(), []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Landing tests" description="A/B tests on the solo landing pages, set before they start. The p-values appear only at the planned looks." />
      <ListAsync state={list} errorTitle="We could not load the landing tests.">
        {(d) => (
          <Panel title="Tests" description="Start a test by setting its start date in experiments.ts; end one from its page." padded={false}>
            <TableWrap>
              <Table label="Landing tests">
                <thead>
                  <tr>
                    <Th>Test</Th>
                    <Th>Page</Th>
                    <Th>Arms</Th>
                    <Th>Started</Th>
                    <Th>Deciding metric</Th>
                    <Th className="min-w-[180px]">Horizon</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((t) => (
                    <Tr key={t.experiment.id} data-experiment={t.experiment.id}>
                      <Td>
                        <a className="font-medium text-fg underline-offset-2 hover:underline" href={`/admin/experiments/${t.experiment.id}`}>
                          {t.experiment.id}
                        </a>
                      </Td>
                      <Td>{t.experiment.pages.map((p) => PAGE_LABEL[p] ?? p).join(", ")}</Td>
                      <Td>{t.experiment.arms.map((a) => a.variant).join(" vs ")}</Td>
                      <Td className="tabular">{formatDate(t.experiment.startedAt)}</Td>
                      <Td>{METRIC_LABEL[t.experiment.decidingMetric]}</Td>
                      <Td>
                        <span className="tabular text-meta text-fg-muted">
                          {formatNumber(t.exposures)} of {formatNumber(t.experiment.horizonExposures)}
                        </span>
                        <Meter className="mt-1.5" value={t.exposures} max={t.experiment.horizonExposures} label={`${t.experiment.id}: exposures toward the horizon`} />
                      </Td>
                      <Td>
                        <StatusPill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</StatusPill>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Panel>
        )}
      </ListAsync>
    </div>
  );
}
