-- CivicFlow — seed data (safe to re-run; idempotent via on conflict).

insert into public.departments (name, contact) values
  ('Roads & Transport',   'roads@civicflow.local'),
  ('Water & Sewerage',    'water@civicflow.local'),
  ('Street Lighting',     'lighting@civicflow.local'),
  ('Sanitation & Waste',  'sanitation@civicflow.local'),
  ('Disaster Management', 'disaster@civicflow.local')
on conflict (name) do nothing;

insert into public.data_sources (name, type, url, reliability_score) values
  ('citizen_reports', 'citizen_report', null, 0.70),
  ('openstreetmap',   'osm',            'https://www.openstreetmap.org', 0.80),
  ('openweather',     'weather',        'https://openweathermap.org/api', 0.60),
  ('municipal_311',   'government',     null, 0.90)
on conflict (name) do nothing;
