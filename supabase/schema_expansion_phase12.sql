-- Pestaña: Actualizaciones (Updates)
CREATE TABLE IF NOT EXISTS public.task_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    author_id TEXT, 
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb, -- [{name: string, url: string}]
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Pestaña: Archivos (Files)
CREATE TABLE IF NOT EXISTS public.task_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT, -- pdf, png, etc.
    size INTEGER,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Pestaña: Actividad (Activity) - Inmutable
CREATE TABLE IF NOT EXISTS public.task_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    actor TEXT,
    action TEXT NOT NULL, -- 'status_changed', 'assigned', 'file_added', etc.
    details JSONB DEFAULT '{}'::jsonb, -- {from: string, to: string}
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

-- Políticas básicas para autenticados
CREATE POLICY "Allow all for authenticated users on task_updates" ON public.task_updates FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users on task_files" ON public.task_files FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users on task_activity" ON public.task_activity FOR SELECT USING (true);

-- Trigger para registrar actividad automáticamente al cambiar el estado de una tarea
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.task_activity (task_id, actor, action, details)
        VALUES (NEW.id, 'System', 'status_changed', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_log_task_activity
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_activity();
