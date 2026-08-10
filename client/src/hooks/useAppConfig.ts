import { useEffect, useState } from 'react';
import api from '../services/api';

export interface DocumentSearchStatus {
  typesense: 'ok' | 'unreachable';
  tika: 'ok' | 'unreachable';
  semantic: 'enabled' | 'disabled' | 'unavailable';
  embeddingModel: string | null;
  mode: 'hybrid' | 'keyword' | 'mysql';
}

export interface AppConfig {
  allowStaffRegistration: boolean;
  documentSearch: DocumentSearchStatus | null;
  loaded: boolean;
}

const defaults: AppConfig = {
  allowStaffRegistration: false,
  documentSearch: null,
  loaded: false,
};

let cached: AppConfig | null = null;

export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(cached ?? defaults);

  useEffect(() => {
    if (cached?.loaded) {
      setConfig(cached);
      return;
    }
    api.get('/config')
      .then(({ data }) => {
        cached = {
          allowStaffRegistration: Boolean(data.allowStaffRegistration),
          documentSearch: data.documentSearch ?? null,
          loaded: true,
        };
        setConfig(cached);
      })
      .catch(() => {
        cached = { ...defaults, loaded: true };
        setConfig(cached);
      });
  }, []);

  return config;
}
