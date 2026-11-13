import type { ReactNode } from "react";

export default function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cx-empty">
      {icon && <div className="cx-empty-icon">{icon}</div>}
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}