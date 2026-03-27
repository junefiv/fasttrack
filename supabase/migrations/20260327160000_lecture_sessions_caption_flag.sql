-- lecture_sessions.caption: 해당 회차에 lecture_captions 가 있으면 true, 없으면 false
-- lecture_captions 변경 시 트리거로 동기화

ALTER TABLE public.lecture_sessions
  ADD COLUMN IF NOT EXISTS caption boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lecture_sessions.caption IS '해당 회차에 lecture_captions 행이 1건 이상이면 true';

UPDATE public.lecture_sessions ls
SET caption = EXISTS (
  SELECT 1 FROM public.lecture_captions c WHERE c.lecture_session_id = ls.id
);

CREATE OR REPLACE FUNCTION public.sync_lecture_session_caption_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.lecture_sessions
    SET caption = EXISTS (
      SELECT 1 FROM public.lecture_captions c WHERE c.lecture_session_id = OLD.lecture_session_id
    )
    WHERE id = OLD.lecture_session_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lecture_session_id IS DISTINCT FROM NEW.lecture_session_id THEN
      UPDATE public.lecture_sessions
      SET caption = EXISTS (
        SELECT 1 FROM public.lecture_captions c WHERE c.lecture_session_id = OLD.lecture_session_id
      )
      WHERE id = OLD.lecture_session_id;
    END IF;
    UPDATE public.lecture_sessions
    SET caption = EXISTS (
      SELECT 1 FROM public.lecture_captions c WHERE c.lecture_session_id = NEW.lecture_session_id
    )
    WHERE id = NEW.lecture_session_id;
    RETURN NEW;
  ELSE
    UPDATE public.lecture_sessions
    SET caption = EXISTS (
      SELECT 1 FROM public.lecture_captions c WHERE c.lecture_session_id = NEW.lecture_session_id
    )
    WHERE id = NEW.lecture_session_id;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_lecture_captions_sync_caption ON public.lecture_captions;

CREATE TRIGGER trg_lecture_captions_sync_caption
  AFTER INSERT OR DELETE OR UPDATE ON public.lecture_captions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lecture_session_caption_flag();
