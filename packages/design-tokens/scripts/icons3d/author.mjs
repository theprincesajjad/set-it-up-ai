import { Local, Scene } from "./engine.mjs";
import { objects } from "./objects.mjs";
import { scenes } from "./scenes.mjs";

export function authorAll(only) {
  const out = {};
  for (const [name, build] of Object.entries(objects)) {
    if (only && !only.includes(name)) continue;
    const s = new Scene();
    build(new Local(s));
    out[name] = s.toSvg();
  }
  for (const [name, build] of Object.entries(scenes)) {
    if (only && !only.includes(name)) continue;
    const s = new Scene();
    build(new Local(s));
    out[name] = s.toSvg({ vbw: 160, vbh: 120, box: [12, 10, 148, 110] });
  }
  return out;
}
