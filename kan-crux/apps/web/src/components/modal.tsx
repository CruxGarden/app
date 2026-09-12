import { Dialog } from "@headlessui/react";

import { useModal } from "~/providers/modal";

interface Props {
  children: React.ReactNode;
  modalSize?: "sm" | "md" | "lg";
  positionFromTop?: "sm" | "md" | "lg";
  isVisible?: boolean;
  closeOnClickOutside?: boolean;
  centered?: boolean;
}

const Modal: React.FC<Props> = ({
  children,
  modalSize = "sm",
  positionFromTop = "md",
  isVisible,
  closeOnClickOutside,
  centered = false,
}) => {
  const {
    isOpen,
    closeModal,
    closeOnClickOutside: modalCloseOnClickOutside,
  } = useModal();

  const shouldShow = isVisible ?? isOpen;
  const shouldCloseOnClickOutside =
    closeOnClickOutside ?? modalCloseOnClickOutside;

  const modalSizeMap = {
    sm: "max-w-[400px]",
    md: "max-w-[550px]",
    lg: "max-w-[800px]",
  };

  const positionFromTopMap = {
    sm: "mt-[12vh]",
    md: "mt-[25vh]",
    lg: "mt-[50vh]",
  };

  // Local adaptation: mutations resolve instantly, so a modal can be closed while
  // Headless UI's entrance transition is still running; that leaves the dialog
  // stuck open. Mount and unmount the dialog directly instead of transitioning.
  if (!shouldShow) return null;
  return (
    <Dialog
      as="div"
      className="relative z-50"
      open
      onClose={shouldCloseOnClickOutside ? closeModal : () => null}
    >
      <div className="fixed inset-0 bg-light-50 bg-opacity-40 dark:bg-dark-50 dark:bg-opacity-40" />
      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className={`flex min-h-full justify-center p-4 text-center sm:p-0 ${centered ? "items-center" : "items-start sm:items-start"}`}>
          <Dialog.Panel
            className={`relative ${centered ? "" : positionFromTopMap[positionFromTop]} w-full transform rounded-lg border border-light-600 bg-white/90 text-left shadow-3xl-light backdrop-blur-[6px] dark:border-dark-600 dark:bg-dark-100/90 dark:shadow-3xl-dark ${modalSizeMap[modalSize]}`}
          >
            {children}
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  );
};

export default Modal;
