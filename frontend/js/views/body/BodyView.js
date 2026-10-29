// Vista provisoria: se reemplaza por la implementación real.
import { h, setText } from "../../ui/dom.js";

export default class BodyView {
  static id = "body";
  constructor(ctx) { this.ctx = ctx; }
  mount(el) { this.out = h("pre", { style: { padding: "24px" } }); el.append(h("h1", { style: { padding: "0 24px" } }, "Body"), this.out); }
  setInfo(info) { this.info = info; }
  update(f) { setText(this.out, JSON.stringify({ n: this.info?.n_motores, ts: f.ts, tmax: f.derived.tempMax, contacts: f.derived.contacts }, null, 2)); }
  destroy() {}
}
