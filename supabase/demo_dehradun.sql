-- CivicFlow Dehradun demo data
-- Run manually in Supabase SQL Editor. These are SIMULATED demo reports, not verified real incidents.
-- Idempotent: external_ref prevents duplicate demo rows.

insert into public.issues
  (category, description, lat, lng, severity, confidence, status, external_ref)
select v.category, v.description, v.lat, v.lng, v.severity, v.confidence, 'verified', v.external_ref
from (values
  -- Original three demo markers
  ('ROAD_DAMAGE', '[DEMO] Simulated pothole near Clock Tower, Dehradun', 30.3256::double precision, 78.0413::double precision, 'high', 90, 'civicflow-demo-pothole-001'),
  ('GARBAGE', '[DEMO] Simulated garbage accumulation near Paltan Bazaar, Dehradun', 30.3270::double precision, 78.0440::double precision, 'medium', 85, 'civicflow-demo-garbage-001'),
  ('STREETLIGHT', '[DEMO] Simulated streetlight issue in central Dehradun', 30.3190::double precision, 78.0320::double precision, 'medium', 80, 'civicflow-demo-light-001'),

  -- 20 additional simulated markers across the four map categories
  ('ROAD_DAMAGE', '[DEMO] Simulated pothole on Rajpur Road', 30.3331::double precision, 78.0608::double precision, 'high', 88, 'civicflow-demo-road-002'),
  ('ROAD_DAMAGE', '[DEMO] Simulated damaged road surface near EC Road', 30.3342::double precision, 78.0522::double precision, 'medium', 82, 'civicflow-demo-road-003'),
  ('ROAD_DAMAGE', '[DEMO] Simulated pothole near Chakrata Road', 30.3230::double precision, 78.0185::double precision, 'critical', 91, 'civicflow-demo-road-004'),
  ('ROAD_DAMAGE', '[DEMO] Simulated cracked road near Dilaram Chowk', 30.3450::double precision, 78.0631::double precision, 'medium', 79, 'civicflow-demo-road-005'),
  ('ROAD_DAMAGE', '[DEMO] Simulated road damage near Ballupur Chowk', 30.3442::double precision, 78.0089::double precision, 'high', 86, 'civicflow-demo-road-006'),

  ('WATER_LEAK', '[DEMO] Simulated water pipe leak near Parade Ground', 30.3268::double precision, 78.0487::double precision, 'high', 87, 'civicflow-demo-water-001'),
  ('WATER_LEAK', '[DEMO] Simulated water leak near Race Course', 30.3097::double precision, 78.0527::double precision, 'medium', 80, 'civicflow-demo-water-002'),
  ('WATER_LEAK', '[DEMO] Simulated leaking public water line near Dharampur', 30.2966::double precision, 78.0472::double precision, 'high', 89, 'civicflow-demo-water-003'),
  ('WATER_LEAK', '[DEMO] Simulated water leak near Karanpur', 30.3390::double precision, 78.0462::double precision, 'medium', 78, 'civicflow-demo-water-004'),
  ('WATER_LEAK', '[DEMO] Simulated pipe leakage near Patel Nagar', 30.3160::double precision, 78.0060::double precision, 'critical', 92, 'civicflow-demo-water-005'),

  ('STREETLIGHT', '[DEMO] Simulated faulty streetlight near Gandhi Park', 30.3349::double precision, 78.0532::double precision, 'medium', 83, 'civicflow-demo-light-002'),
  ('STREETLIGHT', '[DEMO] Simulated streetlight outage near Survey Chowk', 30.3372::double precision, 78.0602::double precision, 'high', 86, 'civicflow-demo-light-003'),
  ('STREETLIGHT', '[DEMO] Simulated damaged streetlight near Nehru Colony', 30.2945::double precision, 78.0478::double precision, 'medium', 81, 'civicflow-demo-light-004'),
  ('STREETLIGHT', '[DEMO] Simulated unlit streetlight near Jakhan', 30.3710::double precision, 78.0752::double precision, 'high', 88, 'civicflow-demo-light-005'),
  ('STREETLIGHT', '[DEMO] Simulated streetlight fault near ISBT', 30.2864::double precision, 78.0107::double precision, 'medium', 77, 'civicflow-demo-light-006'),

  ('FLOODING', '[DEMO] Simulated waterlogging near low-lying road by Bindal', 30.3198::double precision, 78.0258::double precision, 'high', 87, 'civicflow-demo-flood-001'),
  ('FLOODING', '[DEMO] Simulated monsoon flooding near Dharampur', 30.2940::double precision, 78.0510::double precision, 'critical', 93, 'civicflow-demo-flood-002'),
  ('FLOODING', '[DEMO] Simulated road waterlogging near ISBT', 30.2878::double precision, 78.0128::double precision, 'high', 85, 'civicflow-demo-flood-003'),
  ('FLOODING', '[DEMO] Simulated drainage overflow near Prem Nagar', 30.3190::double precision, 77.9998::double precision, 'medium', 80, 'civicflow-demo-flood-004'),
  ('FLOODING', '[DEMO] Simulated rainwater accumulation near Clement Town', 30.2635::double precision, 78.0020::double precision, 'high', 88, 'civicflow-demo-flood-005')
) as v(category, description, lat, lng, severity, confidence, external_ref)
where not exists (
  select 1 from public.issues i where i.external_ref = v.external_ref
);

select category, description, lat, lng, severity, status, external_ref
from public.issues
where external_ref like 'civicflow-demo-%'
order by external_ref;
