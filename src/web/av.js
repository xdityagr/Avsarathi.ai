/* Avsarathi — custom elements.
 *
 * Light DOM on purpose: these render into their own children so the shared
 * stylesheet applies without piercing shadow boundaries, and so the markup is
 * inspectable in devtools during a demo. Each element takes a plain object via
 * its `data` property and re-renders when it changes.
 *
 * No framework, no build step. The page has to work offline for the same reason
 * map tiles are cached locally.
 */

export const rupee = n => "₹" + Math.round(n).toLocaleString("en-IN");
export const pct = n => (n * 100).toFixed(0) + "%";

const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Strip the WhatsApp-style *bold* markers used by the shared literacy copy. */
const plain = s => String(s ?? "").replace(/[*_]/g, "");

/** Base: re-render whenever `data` is assigned. */
class DataElement extends HTMLElement {
  set data(value) { this._data = value; if (this.isConnected) this.render(); }
  get data() { return this._data; }
  connectedCallback() { if (this._data) this.render(); }
  render() {}
}

/* ---------------------------------------------------------------- av-field */

class AvField extends HTMLElement {
  /** Wraps a control with its label. Keeps the control in the light DOM so
   *  forms, validation and keyboard behaviour all work normally. */
  connectedCallback() {
    if (this._done) return;
    this._done = true;
    const control = this.querySelector("input, select, textarea");
    if (!control) return;
    if (!control.id) control.id = "f-" + Math.random().toString(36).slice(2, 8);
    const label = document.createElement("label");
    label.setAttribute("for", control.id);
    label.textContent = this.getAttribute("label") || "";
    this.insertBefore(label, control);
  }
}

/* -------------------------------------------------------------- av-tag/notice */

class AvTag extends HTMLElement {}

class AvNotice extends HTMLElement {
  connectedCallback() {
    const heading = this.getAttribute("heading");
    if (heading && !this.querySelector(".n-h")) {
      const h = document.createElement("div");
      h.className = "n-h";
      h.textContent = heading;
      this.insertBefore(h, this.firstChild);
    }
  }
}

/* ------------------------------------------------------- av-cost-compare */

class AvCostCompare extends DataElement {
  /** data: { loan, schemeLabel, schemeAmount, altLabel, altAmount, foot } */
  render() {
    const d = this._data;
    const max = Math.max(d.schemeAmount, d.altAmount) || 1;
    const w = v => Math.max(1.5, (v / max) * 100) + "%";
    this.innerHTML = `
      <div class="cc-h">What the same ${esc(rupee(d.loan))} costs you in interest</div>
      <div class="cc-row">
        <div class="cc-top"><span class="cc-who">${esc(d.schemeLabel)}</span>
          <span class="cc-amt num">${esc(rupee(d.schemeAmount))}</span></div>
        <div class="cc-track"><div class="cc-fill" style="width:0"></div></div>
      </div>
      <div class="cc-row">
        <div class="cc-top"><span class="cc-who">${esc(d.altLabel)}</span>
          <span class="cc-amt alert num">${esc(rupee(d.altAmount))}</span></div>
        <div class="cc-track"><div class="cc-fill alert" style="width:0"></div></div>
      </div>
      <p class="cc-foot">${esc(d.foot)}</p>`;

    // One deliberate motion: the bars find their length once, on arrival.
    const fills = this.querySelectorAll(".cc-fill");
    requestAnimationFrame(() => {
      fills[0].style.width = w(d.schemeAmount);
      fills[1].style.width = w(d.altAmount);
    });
  }
}

/* -------------------------------------------------------------- av-scheme */

class AvScheme extends DataElement {
  render() {
    const s = this._data;
    if (s.best) this.setAttribute("data-best", "");
    const priority = plain(s.blocks?.priority || "");
    this.innerHTML = `
      <div>
        <h3 class="s-name">${esc(s.name)}${s.best && s.total > 1
          ? '<av-tag tone="accent">lowest cost</av-tag>' : ""}</h3>
        <div class="s-why">${esc(s.why_eligible)}</div>
        ${priority ? `<div class="s-why">${esc(priority)}</div>` : ""}
      </div>
      <div class="s-figs">
        <div class="s-amt num">${esc(rupee(s.total_interest))}</div>
        <div class="s-sub num">interest at ${esc(s.rate)}%</div>
        <div class="s-sub num">${esc(rupee(s.instalment_amount))} ${esc(s.instalment_frequency)}
          × ${esc(s.instalment_count)}</div>
        <div class="s-sub num">about ${esc(rupee(s.monthly_equivalent))} a month</div>
      </div>`;
  }
}

/* ------------------------------------------------------------- av-partner */

class AvPartner extends DataElement {
  render() {
    const p = this._data;
    const tag = p.confidence === "OFFICIAL"
      ? '<av-tag tone="accent">published data</av-tag>'
      : '<av-tag tone="quiet">representative</av-tag>';
    this.innerHTML = `
      <div>
        <h3>${esc(p.rank)}. ${esc(p.name)}</h3>
        <div class="p-meta">${esc(p.district)}, ${esc(p.state)} — ${esc(p.agency_type)}${tag}</div>
        ${p.note ? `<div class="p-meta">${esc(p.note)}</div>` : ""}
        ${p.reasons?.length ? `<div class="p-meta">${esc(p.reasons.join("; "))}</div>` : ""}
      </div>
      <div class="p-figs">
        <div class="p-amt num">${esc(p.distance_km)} km</div>
        <div class="p-sub num">${esc(p.rate)}% to you</div>
      </div>`;
  }
}

customElements.define("av-field", AvField);
customElements.define("av-tag", AvTag);
customElements.define("av-notice", AvNotice);
customElements.define("av-cost-compare", AvCostCompare);
customElements.define("av-scheme", AvScheme);
customElements.define("av-partner", AvPartner);

export { esc, plain };
