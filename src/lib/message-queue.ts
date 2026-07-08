import { supabase } from './supabase';
import { createWhatsAppWebServiceForInstitute } from './whatsapp-web-service';
import { createZavuServiceForInstitute } from './zavu-service';

// Ensure these are explicitly exported
export interface QueuedMessage {
  id?: string;
  institute_id: string;
  recipient: string;
  recipient_name?: string;
  message: string;
  channel: 'whatsapp' | 'sms' | 'email';
  priority: 'high' | 'normal' | 'low';
  scheduled_at?: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempt_count: number;
  last_attempt_at?: string;
  error_message?: string;
  created_at: string;
}

export interface QueueStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
}

const MIN_DELAY = 3;
const MAX_DELAY = 5;
const MAX_RETRIES = 3;

export class MessageQueue {
  private isProcessing = false;
  private currentDelay = MIN_DELAY;
  private instituteId: string;
  private onStatusChange?: (stats: QueueStats) => void;

  constructor(instituteId: string) {
    this.instituteId = instituteId;
  }

  // Helper for internal state check
  getInstituteId(): string {
    return this.instituteId;
  }

  setOnStatusChange(callback: (stats: QueueStats) => void) {
    this.onStatusChange = callback;
  }

  private async notifyStatusChange() {
    if (this.onStatusChange) {
      const stats = await this.getStats();
      this.onStatusChange(stats);
    }
  }

  async getStats(): Promise<QueueStats> {
    const { data: counts, error } = await supabase
      .from('message_queue')
      .select('status')
      .eq('institute_id', this.instituteId);

    if (error) {
      console.error('Error getting queue stats:', error);
      return { pending: 0, sending: 0, sent: 0, failed: 0 };
    }

    const stats: QueueStats = { pending: 0, sending: 0, sent: 0, failed: 0 };
    counts?.forEach((c: any) => {
      if (c.status in stats) {
        (stats as any)[c.status]++;
      }
    });
    return stats;
  }

  async enqueue(message: Omit<QueuedMessage, 'id' | 'status' | 'attempt_count' | 'created_at'>): Promise<QueuedMessage> {
    const now = new Date().toISOString();
    const queuedMessage = {
      ...message,
      status: 'pending' as const,
      attempt_count: 0,
      created_at: now,
    };

    const { data, error } = await supabase
      .from('message_queue')
      .insert([queuedMessage])
      .select()
      .single();

    if (error) throw error;

    await this.notifyStatusChange();
    this.startProcessing();
    return data;
  }

  async enqueueBatch(messages: Array<Omit<QueuedMessage, 'id' | 'status' | 'attempt_count' | 'created_at'>>): Promise<QueuedMessage[]> {
    const now = new Date().toISOString();
    const queuedMessages = messages.map(m => ({
      ...m,
      status: 'pending' as const,
      attempt_count: 0,
      created_at: now,
    }));

    const { data, error } = await supabase
      .from('message_queue')
      .insert(queuedMessages)
      .select();

    if (error) throw error;

    await this.notifyStatusChange();
    this.startProcessing();
    return data || [];
  }

  async getPendingMessages(limit = 10): Promise<QueuedMessage[]> {
    const { data } = await supabase
      .from('message_queue')
      .select('*')
      .eq('institute_id', this.instituteId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    return data || [];
  }

  async updateMessageStatus(id: string, status: QueuedMessage['status'], error?: string): Promise<void> {
    const { data: current } = await supabase
        .from('message_queue')
        .select('attempt_count')
        .eq('id', id)
        .single();

    const updateData: any = { status };
    if (status === 'sending') {
      updateData.last_attempt_at = new Date().toISOString();
      updateData.attempt_count = (current?.attempt_count || 0) + 1;
    } else if (status === 'failed') {
      updateData.error_message = error;
      updateData.last_attempt_at = new Date().toISOString();
    }

    await supabase.from('message_queue').update(updateData).eq('id', id);
    await this.notifyStatusChange();
  }

  async markAsSent(id: string): Promise<void> {
    await supabase
      .from('message_queue')
      .update({ status: 'sent', last_attempt_at: new Date().toISOString() })
      .eq('id', id);

    await this.notifyStatusChange();
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    await supabase
      .from('message_queue')
      .update({ 
        status: 'failed', 
        error_message: error,
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', id);

    await this.notifyStatusChange();
  }

  private async sendWhatsAppMessage(msg: QueuedMessage): Promise<boolean> {
    const cleanPhone = msg.recipient.replace(/[^0-9]/g, '');
    
    // WhatsApp Web Try
    const waWebSvc = await createWhatsAppWebServiceForInstitute(this.instituteId);
    if (waWebSvc) {
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      await waWebSvc.sendMessage({ to: formattedPhone, text: msg.message });
      return true;
    }

    // Zavu Fallback
    const zavuSvc = await createZavuServiceForInstitute(this.instituteId);
    if (zavuSvc) {
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone.startsWith('91') ? '' : '91'}${cleanPhone}`;
      await zavuSvc.sendMessage({ to: formattedPhone, text: msg.message, channel: 'whatsapp' });
      return true;
    }

    throw new Error('No WhatsApp service available');
  }

  private async processMessage(msg: QueuedMessage): Promise<void> {
    await this.updateMessageStatus(msg.id!, 'sending');

    try {
      await this.sendWhatsAppMessage(msg);
      
      await supabase.from('message_logs').insert([{
        institute_id: this.instituteId,
        channel: msg.channel,
        recipient: msg.recipient,
        message: msg.message,
        status: 'sent',
        recipient_name: msg.recipient_name,
      }]);

      await this.markAsSent(msg.id!);
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      
      if (msg.attempt_count >= MAX_RETRIES) {
        await this.markAsFailed(msg.id!, errorMsg);
        await supabase.from('message_logs').insert([{
          institute_id: this.instituteId,
          channel: msg.channel,
          recipient: msg.recipient,
          message: msg.message,
          status: 'failed',
          recipient_name: msg.recipient_name,
        }]);
      } else {
        const delay = Math.pow(2, msg.attempt_count) * 1000;
        await supabase
          .from('message_queue')
          .update({ 
            status: 'pending',
            scheduled_at: new Date(Date.now() + delay).toISOString()
          })
          .eq('id', msg.id);
      }
      throw err;
    }
  }

  private async processNext(): Promise<void> {
    if (!this.isProcessing) return;
    
    const pending = await this.getPendingMessages(1);
    if (pending.length === 0) {
      this.isProcessing = false;
      return;
    }

    const msg = pending[0];
    try {
      await this.processMessage(msg);
    } catch (err) {
      console.error('Failed to process message:', err);
    }

    const delay = this.currentDelay;
    this.currentDelay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    
    setTimeout(() => this.processNext(), delay);
  }

  startProcessing(): void {
    if (!this.isProcessing) {
      this.isProcessing = true;
      this.processNext();
    }
  }

  stopProcessing(): void {
    this.isProcessing = false;
  }
}

let queueInstance: MessageQueue | null = null;

export function getMessageQueue(instituteId: string): MessageQueue {
  if (!queueInstance || queueInstance.getInstituteId() !== instituteId) {
    queueInstance = new MessageQueue(instituteId);
  }
  return queueInstance;
}

export async function getQueueStats(instituteId: string): Promise<QueueStats> {
  const queue = getMessageQueue(instituteId);
  return queue.getStats();
}