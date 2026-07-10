import React from "react";

export interface GenUIFileServices {
  resolveFileUrl?: (index: number, file: Record<string, unknown>) => string | null | undefined;
  uploadFilesMultiple?: (files: File[], message?: string) => void | Promise<void>;
}

const GenUIFileServicesContext = React.createContext<GenUIFileServices | null>(null);

export function GenUIFileServicesProvider({
  services,
  children,
}: {
  services?: GenUIFileServices;
  children: React.ReactNode;
}): React.ReactElement {
  return services
    ? <GenUIFileServicesContext.Provider value={services}>{children}</GenUIFileServicesContext.Provider>
    : <>{children}</>;
}

export function useGenUIFileServices(): GenUIFileServices | null {
  return React.useContext(GenUIFileServicesContext);
}