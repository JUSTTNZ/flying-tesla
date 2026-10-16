/**
 * Gift boxes that award in-game Grok / Cursor tokens. One drawing routine is
 * shared by the side view and the forward POVs: give it the bottom-centre
 * point and the box width in screen pixels.
 */
import { glow, roundRect } from "./utils.js";

const STYLES = {
  grok: { body: ["#2a2f38", "#0e1116"], ribbon: "#f4f7fb", light: "rgba(220, 230, 255, ALPHA)" },
  cursor: { body: ["#ffffff", "#cfd8e4"], ribbon: "#14181f", light: "rgba(120, 200, 255, ALPHA)" },
  golden: { body: ["#ffe08a", "#c98a12"], ribbon: "#d62839", light: "rgba(255, 200, 80, ALPHA)" },
};

// `ground` (screen y of the road under the gift) draws a sparkle tether
// for floating gifts so you can tell they need a jump.
export function drawGiftBox(c, cx, by, size, gift, clock, ground = null) {
  const st = gift.golden ? STYLES.golden : STYLES[gift.token];
  const w = size;
  const h = size * 0.78;
  const x0 = cx - w / 2;
  const y0 = by - h;

  if (gift.high && ground !== null) {
    c.save();
    c.strokeStyle = "rgba(255, 255, 255, 0.35)";
    c.lineWidth = Math.max(1, size * 0.04);
    c.setLineDash([size * 0.12, size * 0.16]);
    c.lineDashOffset = -clock * size;
    c.beginPath();
    c.moveTo(cx, by);
    c.lineTo(cx, ground);
    c.stroke();
    c.restore();
  }

  c.save();
  c.globalCompositeOperation = "lighter";
  const pulse = 1 + Math.sin(clock * 5 + cx * 0.01) * 0.12;
  glow(c, cx, by - h / 2, size * 1.3 * pulse, st.light, gift.golden ? 0.75 : 0.5);
  c.restore();

  // Box and lid.
  const body = c.createLinearGradient(x0, 0, x0 + w, 0);
  body.addColorStop(0, st.body[0]);
  body.addColorStop(1, st.body[1]);
  c.fillStyle = body;
  roundRect(c, x0, y0 + h * 0.22, w, h * 0.78, size * 0.06);
  c.fill();
  c.fillStyle = st.body[0];
  roundRect(c, x0 - w * 0.06, y0 + h * 0.06, w * 1.12, h * 0.22, size * 0.05);
  c.fill();

  // Ribbon cross and bow.
  c.fillStyle = st.ribbon;
  c.fillRect(cx - w * 0.08, y0 + h * 0.06, w * 0.16, h * 0.94);
  c.fillRect(x0 - w * 0.06, y0 + h * 0.13, w * 1.12, h * 0.08);
  c.beginPath();
  c.ellipse(cx - w * 0.16, y0 + h * 0.02, w * 0.17, h * 0.11, -0.5, 0, Math.PI * 2);
  c.ellipse(cx + w * 0.16, y0 + h * 0.02, w * 0.17, h * 0.11, 0.5, 0, Math.PI * 2);
  c.fill();

  // Token mark on the front: "G" for Grok, an arrow pointer for Cursor.
  if (size > 18) {
    const mx = x0 + w * 0.27;
    const my = y0 + h * 0.62;
    c.fillStyle = st.ribbon;
    if (gift.token === "grok") {
      c.font = `800 ${size * 0.3}px 'Avenir Next', 'Segoe UI', sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("G", mx, my);
    } else {
      const k = size * 0.012;
      c.beginPath();
      c.moveTo(mx - 6 * k, my - 10 * k);
      c.lineTo(mx + 8 * k, my + 2 * k);
      c.lineTo(mx + 1 * k, my + 3 * k);
      c.lineTo(mx + 5 * k, my + 11 * k);
      c.lineTo(mx + 1 * k, my + 12 * k);
      c.lineTo(mx - 2 * k, my + 5 * k);
      c.lineTo(mx - 6 * k, my + 9 * k);
      c.closePath();
      c.fill();
    }
  }
}
