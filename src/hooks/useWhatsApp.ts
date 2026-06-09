// ============================================================================
// WhatsApp React Hooks
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getOpenWAService } from '@/lib/openwa-service';
import {
  WhatsAppSession,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppCampaign,
  QRCodeResponse,
  SendMessageRequest,
  SendBulkMessageRequest,
  MessageResponse,
  CreateContactRequest,
  CreateTemplateRequest,
  MessageFilters,
  PaginationParams,
  ErrorState,
  LoadingState,
} from '@/types/whatsapp';

// ============================================================================
// 1. USE WHATSAPP SESSIONS
// ============================================================================

export function useWhatsAppSessions(instituteId: string) {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [activeSession, setActiveSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('institute_id', instituteId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setSessions(data || []);
      const active = data?.find((s) => s.status === 'active');
      setActiveSession(active || null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  const createSession = useCallback(
    async (sessionName: string) => {
      setLoading(true);
      setError(null);
      try {
        const service = getOpenWAService();
        const newSession = await service.createSession(instituteId, sessionName);
        setSessions((prev) => [newSession, ...prev]);
        return newSession;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  const getQRCode = useCallback(async (sessionId: string) => {
    try {
      const service = getOpenWAService();
      return await service.getQRCode(sessionId);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const disconnectSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const service = getOpenWAService();
      await service.disconnectSession(sessionId);
      await fetchSessions();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  const reconnectSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const service = getOpenWAService();
      const qr = await service.reconnectSession(sessionId);
      await fetchSessions();
      return qr;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    activeSession,
    loading,
    error,
    fetchSessions,
    createSession,
    getQRCode,
    disconnectSession,
    reconnectSession,
  };
}

// ============================================================================
// 2. USE WHATSAPP CONTACTS
// ============================================================================

export function useWhatsAppContacts(instituteId: string) {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async (filters?: { group?: string; search?: string }) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('institute_id', instituteId);

      if (filters?.group) {
        query = query.eq('group_name', filters.group);
      }

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }

      const { data, error: fetchError } = await query.order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setContacts(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  const addContact = useCallback(
    async (request: CreateContactRequest) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: insertError } = await supabase
          .from('whatsapp_contacts')
          .insert({
            institute_id: instituteId,
            name: request.name,
            phone: request.phone,
            group_name: request.group_name,
            tags: request.tags || [],
          })
          .select()
          .single();

        if (insertError) throw insertError;

        setContacts((prev) => [data, ...prev]);
        return data;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  const deleteContact = useCallback(async (contactId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('whatsapp_contacts')
        .delete()
        .eq('id', contactId);

      if (deleteError) throw deleteError;

      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const importContacts = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const text = await file.text();
        const lines = text.split('\n');
        const newContacts: CreateContactRequest[] = [];

        // Parse CSV (assuming: name,phone,group)
        for (let i = 1; i < lines.length; i++) {
          const [name, phone, group] = lines[i].split(',').map((s) => s.trim());
          if (name && phone) {
            newContacts.push({ name, phone, group_name: group });
          }
        }

        // Insert all
        const { error: insertError } = await supabase
          .from('whatsapp_contacts')
          .insert(
            newContacts.map((c) => ({
              institute_id: instituteId,
              ...c,
            }))
          );

        if (insertError) throw insertError;

        await fetchContacts();
        return { success: true, count: newContacts.length };
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId, fetchContacts]
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return {
    contacts,
    loading,
    error,
    fetchContacts,
    addContact,
    deleteContact,
    importContacts,
  };
}

// ============================================================================
// 3. USE WHATSAPP TEMPLATES
// ============================================================================

export function useWhatsAppTemplates(instituteId: string) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('institute_id', instituteId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTemplates(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  const createTemplate = useCallback(
    async (request: CreateTemplateRequest) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: insertError } = await supabase
          .from('whatsapp_templates')
          .insert({
            institute_id: instituteId,
            name: request.name,
            content: request.content,
            variables: request.variables || [],
            category: request.category || 'custom',
          })
          .select()
          .single();

        if (insertError) throw insertError;

        setTemplates((prev) => [data, ...prev]);
        return data;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  const deleteTemplate = useCallback(async (templateId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', templateId);

      if (deleteError) throw deleteError;

      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    deleteTemplate,
  };
}

// ============================================================================
// 4. USE WHATSAPP MESSAGES
// ============================================================================

export function useWhatsAppMessages(instituteId: string) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(
    async (filters?: MessageFilters, pagination?: PaginationParams) => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('institute_id', instituteId);

        if (filters?.status) {
          query = query.eq('status', filters.status);
        }

        if (filters?.start_date && filters?.end_date) {
          query = query.gte('created_at', filters.start_date).lte('created_at', filters.end_date);
        }

        if (filters?.search) {
          query = query.or(
            `recipient_phone.ilike.%${filters.search}%,message_content.ilike.%${filters.search}%`
          );
        }

        // Apply pagination
        const limit = pagination?.limit || 50;
        const page = pagination?.page || 1;
        const offset = (page - 1) * limit;

        query = query.range(offset, offset + limit - 1);
        query = query.order('created_at', { ascending: false });

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        setMessages(data || []);
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  const sendMessage = useCallback(
    async (sessionId: string, request: SendMessageRequest): Promise<MessageResponse> => {
      setLoading(true);
      setError(null);
      try {
        const service = getOpenWAService();

        // Send via OpenWA
        const result = await service.sendMessage(sessionId, request);

        // Create record in database
        if (result.success) {
          const { error: insertError } = await supabase.from('whatsapp_messages').insert({
            institute_id: instituteId,
            session_id: sessionId,
            recipient_phone: request.recipient_phone,
            recipient_name: request.recipient_name,
            message_content: request.message_content,
            status: result.status,
            message_type: 'text',
            credits_used: result.credits_used,
          });

          if (insertError) throw insertError;
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    loading,
    error,
    fetchMessages,
    sendMessage,
  };
}

// ============================================================================
// 5. USE WHATSAPP CAMPAIGNS
// ============================================================================

export function useWhatsAppCampaigns(instituteId: string) {
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('whatsapp_campaigns')
        .select('*')
        .eq('institute_id', instituteId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setCampaigns(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return {
    campaigns,
    loading,
    error,
    fetchCampaigns,
  };
}
