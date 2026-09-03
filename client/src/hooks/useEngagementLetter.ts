import { useCallback, useEffect, useState } from 'react';

import api from '@/services/api';
import { apiAbsoluteUrl } from '@/lib/apiBase';



export type LetterBusyAction = 'generate' | 'save' | 'send' | null;



export interface EngagementSummary {

  id: string;

  title: string;

  letterStatus: string;

  requestStatus?: string | null;

  clientRequestId?: string | null;

  client?: { name: string };

  scopeIncluded?: string | null;

}



export interface EngagementLetter {

  id: string;

  status: string;

  generatedContent?: string | null;

  subjectLine?: string | null;

  pdfPath?: string | null;

  sentAt?: string | null;

  signedAt?: string | null;

  updatedAt?: string | null;

}



export function useEngagementLetter(engagementId: string) {

  const [eng, setEng] = useState<EngagementSummary | null>(null);

  const [letter, setLetter] = useState<EngagementLetter | null>(null);

  const [siblingCount, setSiblingCount] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const [busyAction, setBusyAction] = useState<LetterBusyAction>(null);



  const load = useCallback(async (opts?: { silent?: boolean }) => {

    if (!opts?.silent) {

      setLoading(true);

      setError('');

    }

    try {

      const [engRes, letterRes] = await Promise.all([

        api.get<EngagementSummary>(`/engagements/${engagementId}`),

        api.get<EngagementLetter | null>(`/engagement-letters/by-engagement/${engagementId}`),

      ]);

      setEng(engRes.data);

      setLetter(letterRes.data);

      const reqId = engRes.data.clientRequestId;

      if (reqId) {

        const reqRes = await api.get<{ engagements?: { id: string }[] }>(`/requests/${reqId}`);

        setSiblingCount(reqRes.data.engagements?.length ?? 0);

      } else {

        setSiblingCount(0);

      }

    } catch (err: unknown) {

      if (!opts?.silent) {

        const ax = err as { response?: { data?: { error?: string } } };

        setError(ax.response?.data?.error || 'Failed to load engagement letter workflow');

      }

    } finally {

      if (!opts?.silent) setLoading(false);

    }

  }, [engagementId]);



  useEffect(() => {

    void load();

  }, [load]);



  async function generateLetter(

    feeParticular: string,

    feeAmount: string,

    opts?: { scopeOfServices?: string; scopeAndProcess?: string; partnerName?: string }

  ) {

    setBusyAction('generate');

    const prevLetter = letter;

    const prevEng = eng;

    setLetter((l) => ({

      id: l?.id ?? 'optimistic',

      status: 'draft',

      generatedContent: l?.generatedContent ?? null,

    }));

    setEng((e) => (e ? { ...e, letterStatus: 'draft' } : e));

    try {

      const res = await api.post<{ letter: EngagementLetter; preview: string }>('/engagement-letters/generate', {

        engagementId,

        fees: [{ particular: feeParticular, amount: feeAmount }],

        scopeOfServices: opts?.scopeOfServices ?? eng?.scopeIncluded ?? undefined,

        scopeAndProcess: opts?.scopeAndProcess,

        partnerName: opts?.partnerName,

      });

      setLetter(res.data.letter);

      setEng((e) => (e ? { ...e, letterStatus: 'draft' } : e));

      void load({ silent: true });

      return { ok: true as const, preview: res.data.preview };

    } catch (err: unknown) {

      setLetter(prevLetter);

      setEng(prevEng);

      const ax = err as { response?: { data?: { error?: string } } };

      return { ok: false as const, error: ax.response?.data?.error || 'Generate failed' };

    } finally {

      setBusyAction(null);

    }

  }



  async function saveLetterDraft(payload: {

    generatedContent: string;

    subjectLine?: string;

    fees?: { particular: string; amount: string }[];

    partnerName?: string;

  }) {

    if (!letter?.id || letter.id === 'optimistic') {

      return { ok: false as const, error: 'Generate the letter first' };

    }

    setBusyAction('save');

    try {

      const res = await api.patch<EngagementLetter>(`/engagement-letters/${letter.id}`, payload);

      setLetter(res.data);

      return { ok: true as const };

    } catch (err: unknown) {

      const ax = err as { response?: { data?: { error?: string } } };

      return { ok: false as const, error: ax.response?.data?.error || 'Save failed' };

    } finally {

      setBusyAction(null);

    }

  }



  async function sendLetter(scheduledAt?: string) {

    if (!letter) return { ok: false as const, error: 'No letter to send' };

    setBusyAction('send');

    const prevLetter = letter;

    const prevEng = eng;

    const sentAt = new Date().toISOString();

    setLetter({ ...letter, status: 'sent', sentAt });

    setEng((e) => (e ? { ...e, letterStatus: 'sent' } : e));

    try {

      await api.post(`/engagement-letters/${letter.id}/send`, scheduledAt ? { scheduledAt } : {});

      void load({ silent: true });

      return { ok: true as const };

    } catch (err: unknown) {

      setLetter(prevLetter);

      setEng(prevEng);

      const ax = err as { response?: { data?: { error?: string } } };

      return { ok: false as const, error: ax.response?.data?.error || 'Send failed' };

    } finally {

      setBusyAction(null);

    }

  }



  const docxUrl =
    letter?.id && letter.id !== 'optimistic'
      ? apiAbsoluteUrl(`/api/engagement-letters/${letter.id}/docx`)
      : null;



  return {

    eng,

    letter,

    siblingCount,

    loading,

    error,

    busyAction,

    docxUrl,

    load,

    generateLetter,

    saveLetterDraft,

    sendLetter,

  };

}


