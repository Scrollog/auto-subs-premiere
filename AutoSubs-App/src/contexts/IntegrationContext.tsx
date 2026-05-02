import React, { createContext, useContext, useState } from 'react';

export type Integration = "davinci" | "premiere" | "aftereffects";

interface IntegrationContextType {
  selectedIntegration: Integration;
  setSelectedIntegration: (integration: Integration) => void;
}

const IntegrationContext = createContext<IntegrationContextType | null>(null);

export function IntegrationProvider({ children }: { children: React.ReactNode }) {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration>("davinci");

  return (
    <IntegrationContext.Provider value={{ selectedIntegration, setSelectedIntegration }}>
      {children}
    </IntegrationContext.Provider>
  );
}

export const useIntegration = () => {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegration must be used within an IntegrationProvider');
  }
  return context;
};
