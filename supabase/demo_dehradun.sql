-- CivicFlow Dehradun demo data
-- Run manually in Supabase SQL Editor. These are SIMULATED demo reports, not verified real incidents.
-- Idempotent: external_ref prevents duplicate demo rows.

insert into public.issues
  (category, description, lat, lng, severity, confidence, status, external_ref)
select v.category, v.description, v.lat, v.lng, v.severity, v.confidence, 'verified', v.external_ref
from (values
  ('ROAD_DAMAGE', '[DEMO] Simulated pothole near Clock Tower, Dehradun', 30.3256::double precision, 78.0413::double precision, 'high', 90, 'civicflow-demo-pothole-001'),
  ('GARBAGE', '[DEMO] Simulated garbage accumulation near Paltan Bazaar, Dehradun', 30.3270::double precision, 78.0440::double precision, 'medium', 85, 'civicflow-demo-garbage-001'),
  ('STREETLIGHT', '[DEMO] Simulated streetlight issue in central Dehradun', 30.3190::double precision, 78.0320::double precision, 'medium', 80, 'civicflow-demo-light-001')
) as v(category, description, lat, lng, severity, confidence, external_ref)
where not exists (
  select 1 from public.issues i where i.external_ref = v.external_ref
);

select category, description, lat, lng, severity, status, external_ref
from public.issues
where external_ref like 'civicflow-demo-%'
order by external_ref;
