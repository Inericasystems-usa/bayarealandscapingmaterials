/**
 * Minimal imperative toast — `toast("Saved", "success")`. No provider needed;
 * it manages its own fixed container and auto-dismiss. Replaces blocking alert().
 */
export type ToastKind = "info" | "success" | "error";

const COLORS: Record<ToastKind, string> = {
  info: "var(--color-action, #2f6f4f)",
  success: "var(--color-success, #2e7d32)",
  error: "var(--color-danger, #c62828)",
};

export function toast(message: string, kind: ToastKind = "info", ms = 4000): void {
  if (typeof document === "undefined") return;

  let root = document.getElementById("balm-toasts");
  if (!root) {
    root = document.createElement("div");
    root.id = "balm-toasts";
    root.style.cssText =
      "position:fixed;z-index:9999;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;max-width:min(92vw,380px);pointer-events:none";
    document.body.appendChild(root);
  }

  const el = document.createElement("div");
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.style.cssText =
    `pointer-events:auto;background:var(--color-bg-elevated,#fff);color:var(--color-text-primary,#1a1a1a);` +
    `border:1px solid var(--color-border,#e2e2e2);border-left:4px solid ${COLORS[kind]};` +
    `border-radius:8px;padding:10px 14px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.14);` +
    `opacity:0;transform:translateY(6px);transition:opacity .15s,transform .15s`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  const remove = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 180);
  };
  el.addEventListener("click", remove);
  setTimeout(remove, ms);
}
