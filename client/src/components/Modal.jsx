import { useEffect, useRef } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
  className = "app-modal",
  headerClassName = "app-modal-header",
  closeButtonClassName = "app-modal-close",
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className={className}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={headerClassName}>
        <h2>{title}</h2>
        <button className={closeButtonClassName} type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </div>
      {children}
    </dialog>
  );
}
