-- WaPlus.io webhook support (no secret needed)
-- Logs table only

create table if not exists whatsapp_webhooks (
  id uuid default gen_random_uuid() primary key,
  institute_id uuid references institutes(id) on delete cascade,
  type text check (type in ('incoming', 'outgoing')) not null,
  from_phone text not null,
  to_phone text,
  message text,
  status text default 'received',
  raw_payload jsonb,
  created_at timestamp with time zone default now()
);

-- Indexes
create index if not exists whatsapp_webhooks_institute_type on whatsapp_webhooks(institute_id, type);
create index if not exists whatsapp_webhooks_from_phone on whatsapp_webhooks(from_phone);

-- RLS (if needed)
alter table whatsapp_webhooks enable row level security;
create policy "Institute admins can view own webhooks" on whatsapp_webhooks
  for all using (institute_id = (select institute_id from profiles where id = auth.uid())); 

comment on table whatsapp_webhooks is 'WaPlus.io WhatsApp webhook logs';

