-- CampBuddy — Seed der Punkte für die Region CH-VS (Wallis).
-- Erzeugt aus app/src/data/. Mehrfach ausführbar: bestehende Zeilen werden aktualisiert.
--
-- Geometrie und Punkte stammen aus OpenStreetMap (ODbL). Die rechtliche
-- Einstufung ist eigene Pflege und durchgehend 'entwurf' ohne Prüfdatum,
-- weil noch keine Fläche amtlich geprüft ist.

begin;

insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-13135143793', 'CH-VS', 'hut', 'Almagellerhütte', 46.10761, 8.00767, 2894, '{"operator":null,"phone":"+41 27 957 11 79","website":"https://www.almagellerhuette.ch/","capacity":"120","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/13135143793', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6593760147', 'CH-VS', 'campsite', 'Alpenlodge Grimselpass', 46.56086, 8.34457, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6593760147', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-440492081', 'CH-VS', 'campsite', 'Alphubel', 46.06463, 7.77453, null, '{"operator":null,"phone":null,"website":"https://www.campingtaesch.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/440492081', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-487190671', 'CH-VS', 'campsite', 'Attermenzen', 46.08571, 7.7823, null, '{"operator":null,"phone":null,"website":"https://www.camping-randa.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/487190671', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-3063139306', 'CH-VS', 'vehicle_spot', 'Bains de Saillon', 46.17384, 7.19403, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/3063139306', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8857192925', 'CH-VS', 'hut', 'Baltschiederklause', 46.39498, 7.88979, null, '{"operator":"SAC - CAS","phone":null,"website":"https://www.rhone.ch/baltschiederklause","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8857192925', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-14079831901', 'CH-VS', 'hut', 'Baraque du club alpin d''Arolla', 46.01104, 7.48118, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/14079831901', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-294171060', 'CH-VS', 'hut', 'Berggasthaus Trift', 46.03004, 7.72107, 2337, '{"operator":"Familie Hugo und Fabienne Biner","phone":"+41 79 408 70 20","website":"http://www.zermatt.ch/trift","capacity":"48","opening_hours":"Jun-Sep","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/294171060', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-799408881', 'CH-VS', 'campsite', 'Bergheimat', 46.12763, 7.93598, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/799408881', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-13135956569', 'CH-VS', 'hut', 'Berghütte Hohsaas', 46.13923, 7.99177, 3140, '{"operator":null,"phone":null,"website":"https://www.hohsaashuette.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/13135956569', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-13917632701', 'CH-VS', 'hut', 'Berghütte Hohsaas', 46.13922, 7.99181, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/13917632701', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6617740631', 'CH-VS', 'hut', 'Binntalhütte', 46.37471, 8.29181, 2267, '{"operator":"SAC CAS","phone":"+41 27 971 47 97","website":"https://cabane-binntal.ch/","capacity":"50","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6617740631', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-1880342036', 'CH-VS', 'hut', 'Bivacco Città di Gallarate', 45.95197, 7.87729, 3960, '{"operator":"Club Alpino Italiano sezione di Gallarate","phone":null,"website":null,"capacity":"9","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/1880342036', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-1818068910', 'CH-VS', 'hut', 'Bortelhütten', 46.29386, 8.09335, 2113, '{"operator":"Skiklub Brig-Simplon","phone":"+41 27 924 52 10","website":"https://www.bortelhuette.ch/","capacity":"40","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/1818068910', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-316985701', 'CH-VS', 'hut', 'Britanniahütte', 46.06006, 7.93502, 3030, '{"operator":null,"phone":"+41 27 957 22 88","website":"https://www.britannia.ch/","capacity":"101","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/316985701', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11215332056', 'CH-VS', 'hut', 'Cabane Becs de Bosson', 46.16419, 7.51633, 2985, '{"operator":null,"phone":"+41 78 743 79 89","website":"https://www.cabanedesbecs.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11215332056', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-567341871', 'CH-VS', 'hut', 'Cabane Bella-Tola', 46.23289, 7.6143, 2346, '{"operator":null,"phone":"+41 27 4761567","website":"https://cabanebellatola.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/567341871', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309750964', 'CH-VS', 'hut', 'Cabane Brunet', 46.03034, 7.2742, 2104, '{"operator":null,"phone":"+41 27 778 18 10","website":"https://www.cabanebrunet.ch/","capacity":"56","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309750964', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4411039606', 'CH-VS', 'hut', 'Cabane d''Anthème', 46.16577, 6.90429, 2037, '{"operator":"Fernand Jordan","phone":"+41 79 473 71 40","website":"https://antheme.ch/","capacity":"35","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4411039606', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4399549524', 'CH-VS', 'hut', 'Cabane d''Arpitettaz', 46.10089, 7.67936, 2786, '{"operator":"SAC CAS","phone":"+41 27 475 40 28","website":"https://www.arpitettaz.ch/","capacity":"32","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4399549524', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6811520910', 'CH-VS', 'hut', 'Cabane d''Orny', 46.00191, 7.06281, 2826, '{"operator":"SAC-CAS Section Diableret","phone":"+41 27 783 18 87","website":"https://cas-diablerets.ch/cabanes/cabane-orny/","capacity":"83","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6811520910', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11136343328', 'CH-VS', 'hut', 'Cabane de Balavaux', 46.15546, 7.27795, null, '{"operator":null,"phone":"+41 78 255 88 07","website":"https://www.cabanebalavaux.com/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11136343328', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309758417', 'CH-VS', 'hut', 'Cabane de Bertol CAS', 46.00602, 7.52767, 3311, '{"operator":"SAC - CAS Section Neuchateloise","phone":"+41 27 283 19 29","website":"http://www.bertol.ch","capacity":"80","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309758417', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11773953799', 'CH-VS', 'hut', 'Cabane de l''Illhorn', 46.25608, 7.59706, null, '{"operator":null,"phone":"+41 78 205 80 03","website":"https://cabaneillhorn.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11773953799', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4399832720', 'CH-VS', 'hut', 'Cabane de la Tsa', 46.03035, 7.50382, 2607, '{"operator":null,"phone":"+41 76 261 11 48","website":"https://www.cabtza.com/","capacity":"32","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4399832720', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-936745007', 'CH-VS', 'hut', 'Cabane de la Tsissette', 45.95376, 7.15549, 2005, '{"operator":null,"phone":null,"website":"https://latsissette.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/936745007', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-302898492', 'CH-VS', 'hut', 'Cabane de Mille', 46.01367, 7.20657, 2473, '{"operator":null,"phone":"+41 27 783 11 82","website":"https://www.cabanedemille.ch","capacity":"40","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/302898492', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4399562394', 'CH-VS', 'hut', 'Cabane de Moiry', 46.09069, 7.59549, 2825, '{"operator":"SAC - CAS","phone":"+41 27 475 45 34","website":"https://cabane-moiry.ch/","capacity":"96","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4399562394', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11203686940', 'CH-VS', 'hut', 'Cabane de Prarochet', 46.31443, 7.24745, 2555, '{"operator":null,"phone":"+41 27 395 27 27","website":"https://www.ski-club-saviese.ch","capacity":"44","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11203686940', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309757022', 'CH-VS', 'hut', 'Cabane de Saleinaz CAS', 45.97644, 7.07037, 2691, '{"operator":"CAS Section Neuchâteloise","phone":"+41 27 783 17 00","website":"https://www.cas-neuchatel.ch/cabanes/cabane-de-saleinaz-2691m/","capacity":"48","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309757022', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6920077295', 'CH-VS', 'hut', 'Cabane de Sorniot', 46.16932, 7.09491, 2064, '{"operator":null,"phone":"+41 27 746 24 26","website":"http://www.sorniot.ch","capacity":"46","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6920077295', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4411041258', 'CH-VS', 'hut', 'Cabane de Susanfe', 46.13943, 6.8981, 2110, '{"operator":null,"phone":"+41 24 479 16 46","website":"https://susanfe.ch/","capacity":"71","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4411041258', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309753126', 'CH-VS', 'hut', 'Cabane de Valsorey', 45.93037, 7.27176, 3037, '{"operator":null,"phone":"+41 27 787 11 22","website":"https://www.valsorey.ch/","capacity":"52","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309753126', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11331670994', 'CH-VS', 'hut', 'Cabane des Audannes', 46.34345, 7.38408, 2506, '{"operator":null,"phone":"+41 79 310 90 60","website":"https://www.audannes.ch/","capacity":"46","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11331670994', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-10167629346', 'CH-VS', 'hut', 'Cabane des Vignettes CAS', 45.98979, 7.47574, 3160, '{"operator":"SAC - CAS Sektion Monte Rosa","phone":"+41 27 283 13 22","website":"https://cabane-des-vignettes.ch/","capacity":"125","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/10167629346', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-9362492877', 'CH-VS', 'hut', 'Cabane des Violettes', 46.34238, 7.50005, 2209, '{"operator":"SAC - CAS","phone":"+41 27 481 39 19","website":"http://www.cabanedesviolettes.ch","capacity":"24","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/9362492877', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-7126563688', 'CH-VS', 'hut', 'Cabane du Col de Cou', 46.15044, 6.7928, null, '{"operator":null,"phone":null,"website":"https://www.cabane-col-de-cou.net/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/7126563688', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6919661171', 'CH-VS', 'hut', 'Cabane du Demècre', 46.17407, 7.08224, 2361, '{"operator":"Les Trotteurs de Fully","phone":"+41 27 746 35 87","website":"https://www.demecre.ch/","capacity":"27","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6919661171', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8210223277', 'CH-VS', 'hut', 'Cabane du Mountet CAS', 46.06005, 7.65354, 2886, '{"operator":"SAC - CAS","phone":"+41 27 475 14 31","website":"https://cas-diablerets.ch/","capacity":"80","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8210223277', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-568030396', 'CH-VS', 'hut', 'Cabane du Plan du Jeu', 45.90248, 7.20559, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/568030396', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6811522337', 'CH-VS', 'hut', 'Cabane du Trient', 45.9996, 7.04365, 3170, '{"operator":null,"phone":"+41 27 783 14 38","website":"https://cas-diablerets.ch/cabanes/cabane-du-trient/","capacity":"90","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6811522337', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309753131', 'CH-VS', 'hut', 'Cabane du Vélan', 45.91694, 7.24546, 2642, '{"operator":"CAS Bourg-Saint-Pierre","phone":"+41 27 787 13 13","website":"https://www.velan.ch/","capacity":"62","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309753131', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309753135', 'CH-VS', 'hut', 'Cabane FXB Panossière', 45.99872, 7.29976, 2641, '{"operator":null,"phone":"+41 27 771 33 22","website":"https://www.panossiere.ch/","capacity":"75","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309753135', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11862748732', 'CH-VS', 'hut', 'Cabane La Luy', 46.12648, 7.17371, null, '{"operator":"Ski-Club \"La Luy\"","phone":null,"website":"https://www.skiclublaluy.ch/cabane/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11862748732', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-309759750', 'CH-VS', 'hut', 'Cabane Mont Fort', 46.08356, 7.28105, 2457, '{"operator":null,"phone":"+41 77 269 45 27","website":"https://cabanemontfort.com","capacity":"58","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/309759750', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-281362008', 'CH-VS', 'campsite', 'Camping & Schwimmbad Mühleye', 46.29907, 7.87232, null, '{"operator":null,"phone":"+41 27 946 20 84","website":"https://www.camping-visp.ch/","capacity":null,"opening_hours":"Mar 25-Oct 31","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/281362008', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1306453004', 'CH-VS', 'campsite', 'Camping Alp Safari', 46.2239, 7.4239, null, '{"operator":null,"phone":"+41 27 203 17 95","website":"https://alpsafari.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1306453004', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-320484762', 'CH-VS', 'campsite', 'Camping Bella-Tola', 46.2991, 7.63749, null, '{"operator":null,"phone":"+41 27 473 14 91","website":"https://www.bella-tola.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/320484762', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-297101485', 'CH-VS', 'campsite', 'Camping Brigga (Sektor C)', 46.45666, 8.2297, null, '{"operator":null,"phone":null,"website":"https://www.campingbrigga.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/297101485', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-331710989', 'CH-VS', 'campsite', 'Camping d''Anniviers', 46.2176, 7.5828, null, '{"operator":null,"phone":"+41 27 475 14 09","website":"http://camping-anniviers.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/331710989', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-233244021', 'CH-VS', 'campsite', 'Camping d''Evolène', 46.11106, 7.49681, null, '{"operator":null,"phone":null,"website":"https://www.camping-evolene.ch/index.php/fr/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/233244021', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-417318351', 'CH-VS', 'campsite', 'Camping de l''Arpille', 46.05848, 7.00137, null, '{"operator":null,"phone":"+41 27 722 26 88","website":"http://coldelaforclaz.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/417318351', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-335526670', 'CH-VS', 'campsite', 'Camping de la Sarvaz', 46.15926, 7.16783, null, '{"operator":null,"phone":null,"website":"https://www.sarvaz.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/335526670', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-422272426', 'CH-VS', 'campsite', 'Camping des Glaciers', 45.93438, 7.09369, 1600, '{"operator":null,"phone":"+41 27 783 18 26","website":"https://www.camping-glaciers.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/422272426', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-337165391', 'CH-VS', 'campsite', 'Camping du Pont', 46.18833, 7.58918, null, '{"operator":null,"phone":"+41 79 658 24 51","website":"http://www.potentille.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/337165391', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-265244406', 'CH-VS', 'campsite', 'Camping Eggishorn', 46.41014, 8.13988, null, '{"operator":null,"phone":"+41 27 971 03 16","website":"http://www.camping-eggishorn.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/265244406', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-359601766', 'CH-VS', 'campsite', 'Camping Fafleralp', 46.43515, 7.8616, 1765, '{"operator":null,"phone":"+41 79 155 03 04","website":"camping-fafleralp.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/359601766', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-469924419', 'CH-VS', 'campsite', 'Camping Forêt des Mélèzes et village Sioux', 46.0177, 7.33136, null, '{"operator":"Thierry & Vera Rausis","phone":null,"website":"https://www.bonatchiesse.ch/hebergementterraindecamping","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/469924419', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1274041096', 'CH-VS', 'campsite', 'Camping Gemmi Agarn', 46.29793, 7.6585, null, '{"operator":null,"phone":"+41 27 473 11 54","website":"https://campgemmi.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1274041096', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-274171059', 'CH-VS', 'campsite', 'Camping Geschina', 46.3088, 7.99373, null, '{"operator":"Fam. Eyer & Schmid","phone":"+41 27 923 06 88","website":"https://www.geschina.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/274171059', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-60230464', 'CH-VS', 'campsite', 'Camping Giessen', 46.36984, 8.20427, null, '{"operator":"Familie Guntern","phone":"+41 27 971 46 19","website":"https://www.camping-giessen.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/60230464', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-1865226747', 'CH-VS', 'campsite', 'Camping La Châtaigneraie', 46.17389, 7.03524, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/1865226747', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4655565490', 'CH-VS', 'campsite', 'Camping Les Carettes', 46.38216, 6.85676, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4655565490', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-1392043239', 'CH-VS', 'campsite', 'Camping Les Marécottes', 46.10788, 7.00723, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/1392043239', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-363391259', 'CH-VS', 'campsite', 'Camping Monument', 46.30774, 7.61133, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/363391259', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-26860701', 'CH-VS', 'campsite', 'Camping Moubra', 46.30408, 7.48063, null, '{"operator":null,"phone":"+41 27 481 28 51","website":"https://www.campingmoubra.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/26860701', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-245104137', 'CH-VS', 'campsite', 'Camping Moubra', 46.30466, 7.48149, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/245104137', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-297101489', 'CH-VS', 'campsite', 'Camping Riverside', 46.46398, 8.24411, null, '{"operator":null,"phone":"+41 27 973 30 30","website":"https://www.campingriverside.ch/","capacity":"150","opening_hours":"week 01-53","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/297101489', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-237890941', 'CH-VS', 'campsite', 'Camping Sedunum', 46.21035, 7.31118, null, '{"operator":null,"phone":"+41 79 793 28 06","website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/237890941', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-232588276', 'CH-VS', 'campsite', 'Camping Sportarena Leukerbad', 46.38161, 7.62302, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/232588276', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-148642887', 'CH-VS', 'campsite', 'Camping Torrent', 46.29855, 7.65755, null, '{"operator":null,"phone":"+41 79 327 63 12","website":"https://campingtorrent.ch","capacity":null,"opening_hours":"Mo-Su 08:00-12:00; Mo-Su 14:00-22:00","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/148642887', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-236932688', 'CH-VS', 'campsite', 'Camping Valcentre', 46.23774, 7.41491, null, '{"operator":null,"phone":null,"website":"https://campingvalcentre.ch","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/236932688', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-569323858', 'CH-VS', 'campsite', 'Camping Zermatt', 46.02615, 7.75011, null, '{"operator":null,"phone":null,"website":"https://www.campingzermatt.ch","capacity":null,"opening_hours":"May 25 - Sep 30","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/569323858', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4513441913', 'CH-VS', 'hut', 'Chalet de Savolayre C.A.S', 46.22825, 6.87727, null, '{"operator":"CAS Monté Rosa Monthey","phone":null,"website":null,"capacity":"31","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4513441913', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-14053736601', 'CH-VS', 'vehicle_spot', 'Chandoline Echertes', 46.24754, 7.60363, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":"24/7","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/14053736601', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559811', 'CH-VS', 'hut', 'Col de la Dent Blanche CAS Bivouac', 46.04193, 7.60709, 3540, '{"operator":"SAC - CAS","phone":null,"website":"https://www.cas-jaman.ch/cabanes/bivouac-de-la-dent-blanche","capacity":"15","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559811', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8453717926', 'CH-VS', 'hut', 'Driesthütte', 46.40713, 8.01938, 2181, '{"operator":"Burgerschaft Naters","phone":null,"website":"http://www.burgerschaft-naters.ch/?id=49","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8453717926', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-10177900507', 'CH-VS', 'hut', 'Finsteraarhornhütte', 46.52198, 8.11447, 3048, '{"operator":null,"phone":"+41 33 855 29 55","website":"https://www.finsteraarhornhuette.ch/","capacity":"116","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/10177900507', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4987947849', 'CH-VS', 'hut', 'Galmihornhütte', 46.48927, 8.24289, 2113, '{"operator":null,"phone":"+41 79 410 12 58","website":"https://galmihornhuette.ch/","capacity":"35","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4987947849', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6920374590', 'CH-VS', 'hut', 'Gîte d''alpage de Dorbon', 46.25917, 7.19047, null, '{"operator":null,"phone":"+41 78 761 52 47","website":"https://www.dorbon.ch/","capacity":"20","opening_hours":"Jun 08 - Sep 29","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6920374590', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-14098779289', 'CH-VS', 'hut', 'Gletscherstube Märjelen', 46.44042, 8.10204, 2360, '{"operator":null,"phone":"+41 27 971 47 83","website":"http://www.gletscherstube.ch","capacity":"34","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/14098779289', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-440494717', 'CH-VS', 'campsite', 'Gräshenbiel', 46.19319, 7.82716, null, '{"operator":null,"phone":"+41793160132","website":null,"capacity":"43","opening_hours":null,"seasonal":"yes"}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/440494717', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-13729864528', 'CH-VS', 'hut', 'Grünsee Mountain Lodge', 46.00599, 7.7797, 2296, '{"operator":null,"phone":"+41 79 900 23 00","website":"https://gruenseemountainlodge.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/13729864528', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11242272119', 'CH-VS', 'hut', 'Hollandiahütte', 46.47527, 7.96017, 3238, '{"operator":"SAC - CAS","phone":"+41 27 939 11 35","website":"https://www.hollandiahuette.ch/","capacity":"86","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11242272119', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-9070906905', 'CH-VS', 'hut', 'Hörnlihütte', 45.9822, 7.67701, 3260, '{"operator":"SAC","phone":"+41 27 967 22 64","website":"https://hoernlihuette.ch/","capacity":"120","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/9070906905', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-1458720984', 'CH-VS', 'hut', 'Kinhütte', 46.08853, 7.80709, 2584, '{"operator":"Gebrüder Imboden, Täsch","phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/1458720984', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559966', 'CH-VS', 'hut', 'L''Aiguillette à la Singla CAS Bivouac', 45.94147, 7.45408, 3179, '{"operator":"SAC - CAS","phone":null,"website":"https://cas-chasseron.ch/","capacity":"12","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559966', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-7884143085', 'CH-VS', 'hut', 'La Cabane à Joseph', 46.36882, 6.80384, null, '{"operator":null,"phone":null,"website":"http://www.st-gingolph.com/documents/randoB1.pdf","capacity":null,"opening_hours":"24/7","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/7884143085', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-331365827', 'CH-VS', 'campsite', 'La Chataigneraie', 46.1754, 7.0363, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/331365827', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-530262741', 'CH-VS', 'vehicle_spot', 'La Mare au Diable', 46.23994, 6.84983, null, '{"operator":null,"phone":"+41 79 301 33 33","website":"https://www.morgins-loisirs.ch/index.php/camping","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/530262741', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-2820208447', 'CH-VS', 'hut', 'La Peule', 45.89862, 7.11259, 2071, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/2820208447', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1090591832', 'CH-VS', 'campsite', 'Le Peuty', 46.04609, 6.99442, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1090591832', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6913946927', 'CH-VS', 'hut', 'Lui d''Aout', 46.19345, 7.13871, 1957, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6913946927', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-251403227', 'CH-VS', 'hut', 'Mischabelhütte', 46.10942, 7.8888, 3340, '{"operator":"Akademischer Alpen-Club Zürich","phone":"+41 27 957 13 17","website":"https://www.mischabelhuette.ch/","capacity":"120","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/251403227', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559916', 'CH-VS', 'hut', 'Mischabeljochbiwak SAC', 46.07421, 7.86582, 3847, '{"operator":"SAC - CAS","phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559916', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-3012482981', 'CH-VS', 'hut', 'Mittlenberghütte', 46.38553, 8.27785, 2395, '{"operator":null,"phone":"+41 27 971 45 48","website":"https://mittlenberghuette.ch/","capacity":"18","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/3012482981', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559908', 'CH-VS', 'hut', 'Monte Leone-Hütte', 46.26074, 8.08032, 2848, '{"operator":"SAC - CAS, Section Sommartel","phone":"+41 27 979 14 12","website":"https://www.cas-sommartel.ch/","capacity":"20","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559908', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11063882922', 'CH-VS', 'hut', 'Monte Rosa Hütte', 45.95693, 7.81457, 2883, '{"operator":"Monte Rosa Hütte Zermatt Betriebs GmbH","phone":"+41 27 967 21 15","website":"https://monterosahuette.ch","capacity":"120","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11063882922', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-219360252', 'CH-VS', 'campsite', 'Neivilles TCS Camping', 46.0976, 7.08029, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/219360252', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-10101322757', 'CH-VS', 'hut', 'Oberaarjochhütte', 46.52607, 8.17306, 3258, '{"operator":"SAC","phone":"+41 33 973 13 82","website":"https://www.oberaarjochhuette.ch/","capacity":"30","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/10101322757', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-11262553552', 'CH-VS', 'hut', 'Oberaletschhütte', 46.42494, 7.97381, 2640, '{"operator":"SAC - CAS","phone":"+41 27 927 17 67","website":"http://www.oberaletsch.ch","capacity":"58","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/11262553552', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4642006491', 'CH-VS', 'vehicle_spot', 'Peutex', 46.10805, 6.99973, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4642006491', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-3021885871', 'CH-VS', 'hut', 'Plan de l''Au', 46.0501, 7.07934, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/3021885871', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-60528576', 'CH-VS', 'vehicle_spot', 'Rastplatz "Stalden"', 46.36514, 7.99353, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/60528576', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-2400526754', 'CH-VS', 'hut', 'Refuge d’ Airoz (Refuge d’ Aïroz)', 46.26638, 7.27461, null, '{"operator":null,"phone":null,"website":"http://www.alpe-airoz.com","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/2400526754', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4411068612', 'CH-VS', 'hut', 'Refuge de Bonavau', 46.15081, 6.86624, 1550, '{"operator":null,"phone":"+41 78 823 33 98","website":"https://www.facebook.com/Refuge.Bonavau/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4411068612', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-4411036267', 'CH-VS', 'hut', 'Refuge de Chalin', 46.17922, 6.94721, 2595, '{"operator":"SAC - CAS","phone":"+41 24 466 31 24","website":"https://www.cas-chaussy.ch/","capacity":"8","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/4411036267', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559748', 'CH-VS', 'hut', 'Refuge des Bouquetins CAS', 45.97088, 7.53052, 2980, '{"operator":"SAC - CAS","phone":null,"website":"http://www.cas-valdejoux.ch","capacity":"26","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559748', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-10045457453', 'CH-VS', 'hut', 'Refuge des Dents du Midi', 46.16429, 6.93902, 2884, '{"operator":"Club Alpin Suisse (section Argentine)","phone":"+41 79 680 60 71","website":"https://www.cas-argentine.ch/","capacity":"20","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/10045457453', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6920281757', 'CH-VS', 'hut', 'Refuge du Lac', 46.27984, 7.21446, 1462, '{"operator":null,"phone":"+41 27 346 14 28","website":"https://www.refugederborence.ch/","capacity":"36","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6920281757', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-458867305', 'CH-VS', 'hut', 'Refuge Igloo des Pantalons Blancs', 46.04054, 7.36852, 3280, '{"operator":null,"phone":"+41 77 812 18 87","website":"https://new.clubalpinsion.ch/","capacity":"15","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/458867305', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6893389795', 'CH-VS', 'hut', 'Refuge La Vouivre', 46.34509, 6.83258, null, '{"operator":null,"phone":"+41 24 481 14 80","website":"https://www.lactaney.com/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6893389795', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-849977275', 'CH-VS', 'hut', 'Refuge Le Peuty', 46.04663, 6.9939, null, '{"operator":null,"phone":"+41 78 719 29 83","website":"https://www.refugelepeuty.ch/","capacity":"22","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/849977275', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-3141305154', 'CH-VS', 'campsite', 'Relais d''Arpette', 46.03028, 7.09341, null, '{"operator":null,"phone":"+41 27 783 12 21","website":"https://arpette.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/3141305154', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-7740615063', 'CH-VS', 'campsite', 'Relais de la Tzoucdana', 46.12597, 7.63146, null, '{"operator":null,"phone":"+41 27 475 12 19","website":"https://tzoucdana.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/7740615063', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-288630307', 'CH-VS', 'campsite', 'Rive Bleue', 46.38611, 6.85991, null, '{"operator":null,"phone":null,"website":"https://www.camping-rive-bleue.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/288630307', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-289916794', 'CH-VS', 'vehicle_spot', 'Rive Bleue', 46.38758, 6.85977, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/289916794', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-298982796', 'CH-VS', 'campsite', 'Santa Monica', 46.30212, 7.80379, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/298982796', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-10167539308', 'CH-VS', 'hut', 'Schönbielhütte SAC', 46.00198, 7.62896, 2694, '{"operator":"SAC - CAS","phone":"+41 27 967 13 54","website":"https://www.section-monte-rosa.ch/","capacity":"70","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/10167539308', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-799407326', 'CH-VS', 'campsite', 'Schönblick', 46.11115, 7.94268, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/799407326', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-225927333', 'CH-VS', 'campsite', 'Simplonblick', 46.30298, 7.79535, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/225927333', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197882', 'CH-VS', 'vehicle_spot', 'Stellplatz Binii', 46.25706, 7.34396, null, '{"operator":null,"phone":null,"website":"https://www.saviese-tourisme.ch/","capacity":"12","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197882', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1300597462', 'CH-VS', 'campsite', 'Stellplatz Camp Bietschhorn', 46.27707, 7.82419, null, '{"operator":null,"phone":null,"website":"https://nomady.camp/cabin/44/camp-bietschhorn-burchen/preview","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1300597462', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-375675526', 'CH-VS', 'vehicle_spot', 'Stellplatz Clos des Frès', 46.17379, 7.57168, null, '{"operator":null,"phone":null,"website":null,"capacity":"8","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/375675526', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197881', 'CH-VS', 'vehicle_spot', 'Stellplatz Curala', 46.0769, 7.21818, null, '{"operator":null,"phone":"+41 27 775 38 70","website":"https://www.verbier.ch/en/offers/p4-curala-motorhome-park-le-chable-en-4625148/","capacity":"16","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197881', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8663157015', 'CH-VS', 'vehicle_spot', 'Stellplatz Hexenplatz', 46.3108, 7.63444, null, '{"operator":null,"phone":null,"website":null,"capacity":"5","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8663157015', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8663147976', 'CH-VS', 'vehicle_spot', 'Stellplatz Lac Souterrain', 46.25548, 7.42605, null, '{"operator":null,"phone":null,"website":null,"capacity":"6","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8663147976', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1189941372', 'CH-VS', 'campsite', 'Stellplatz Lampertji 6', 46.3073, 7.74208, null, '{"operator":null,"phone":"+41 78 820 23 52","website":"https://www.lampertji6.ch/stellplatz","capacity":"100","opening_hours":"24/7","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1189941372', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-9033053684', 'CH-VS', 'vehicle_spot', 'Stellplatz Martigny', 46.09597, 7.07606, null, '{"operator":null,"phone":null,"website":null,"capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/9033053684', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-403575074', 'CH-VS', 'vehicle_spot', 'Stellplatz Saas-Fee', 46.11083, 7.93361, null, '{"operator":null,"phone":null,"website":"https://www.saas-fee.ch/de/unterkuenfte/camping/abstellplatz-fuer-camper","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/403575074', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-9053862657', 'CH-VS', 'vehicle_spot', 'Stellplatz Seepark Augstbord', 46.28858, 7.80143, null, '{"operator":null,"phone":"+41 27 934 56 56","website":"https://unterbaech.ch/","capacity":"6","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/9053862657', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1308278140', 'CH-VS', 'vehicle_spot', 'Stellplatz Seepark Augstbord', 46.28866, 7.80145, null, '{"operator":"Unterbäch Tourismus","phone":null,"website":"https://www.parknsleep.app/ps/27264132","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1308278140', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-3067123015', 'CH-VS', 'vehicle_spot', 'Stellplatz Simplonpass', 46.24919, 8.03029, null, '{"operator":null,"phone":null,"website":null,"capacity":"15","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/3067123015', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197885', 'CH-VS', 'vehicle_spot', 'Stellplatz Wildi', 46.0932, 7.78, null, '{"operator":null,"phone":null,"website":"https://www.matterhornparking.ch/","capacity":"15","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197885', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197879', 'CH-VS', 'vehicle_spot', 'Stellplatz Zinal', 46.14038, 7.62401, null, '{"operator":null,"phone":"+41274761705","website":"https://www.valdanniviers.ch/","capacity":"8","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197879', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197884', 'CH-VS', 'vehicle_spot', 'Stellplatz Zumoberhaus', 46.27731, 7.81501, null, '{"operator":null,"phone":null,"website":"https://www.moosalpregion.ch/","capacity":"4","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197884', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559964', 'CH-VS', 'hut', 'Stockhorn-Biwak', 46.37742, 7.88101, 2598, '{"operator":"SAC Blümlisalp","phone":null,"website":"http://www.stockhornbiwak.ch","capacity":"18","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559964', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-335528058', 'CH-VS', 'campsite', 'Swiss-Plage', 46.3004, 7.56509, null, '{"operator":"Famille Genoud","phone":"+41 27 455 66 08","website":"https://www.swissplage.ch/fr/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/335528058', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8453717925', 'CH-VS', 'hut', 'Tällihütte', 46.40322, 8.01663, 1951, '{"operator":null,"phone":null,"website":"http://www.burgerschaft-naters.ch/?id=49","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8453717925', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559963', 'CH-VS', 'hut', 'Täschhütte', 46.05157, 7.83001, 2701, '{"operator":"SAC - CAS","phone":"+41 27 967 39 13","website":"https://www.taeschhuette.ch","capacity":"74","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559963', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-236984494', 'CH-VS', 'campsite', 'TCS Camping Sion', 46.2116, 7.316, null, '{"operator":"TCS","phone":null,"website":"https://www.tcs.ch/fr/camping-voyages/camping-insider/campings/tcs-campings/camping-sion.php","capacity":"679","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/236984494', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-1315723958', 'CH-VS', 'campsite', 'Van d''en Haut', 46.14005, 6.99254, null, '{"operator":null,"phone":"+41 27 761 26 61","website":"https://www.campingdevandenhaut.com/tarifs/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/1315723958', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8747425935', 'CH-VS', 'vehicle_spot', 'Wald-stellplatz Rhodania', 46.46623, 8.24477, null, '{"operator":null,"phone":"+41 76 533 46 42","website":"https://www.waldstellplatz.ch/","capacity":"20","opening_hours":"1 May - 31 Oct","seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8747425935', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-502559977', 'CH-VS', 'hut', 'Weisshornhütte SAC', 46.08596, 7.74359, 2932, '{"operator":"SAC - CAS","phone":"+41 27 967 12 62","website":"https://www.sac-basel.ch/huetten/weisshornhuette","capacity":"31","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/502559977', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-13135956571', 'CH-VS', 'hut', 'Weissmieshütte SAC', 46.14376, 7.97788, 2726, '{"operator":"SAC - CAS","phone":"+41 27 957 25 54","website":"https://www.weissmieshuette.ch/","capacity":"125","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/13135956571', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-8674197883', 'CH-VS', 'vehicle_spot', 'Winter-Stellplatz Mühleye', 46.29774, 7.87363, null, '{"operator":"Camping & Schwimmbad Mühleye","phone":"+41 27 946 20 84","website":"https://camping-visp.ch/","capacity":"10","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/8674197883', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-node-6684839287', 'CH-VS', 'hut', 'Wiwannihütte', 46.3447, 7.86183, 2470, '{"operator":null,"phone":"+41 27 946 74 78","website":"https://www.wiwanni.ch/","capacity":"44","opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/node/6684839287', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();
insert into public.points (id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified)
values ('osm-way-662194723', 'CH-VS', 'campsite', 'Woodland Village', 46.29411, 7.41518, null, '{"operator":null,"phone":"+41 27 565 21 10","website":"https://woodlandvillage.ch/","capacity":null,"opening_hours":null,"seasonal":null}'::jsonb, 'OpenStreetMap', 'https://www.openstreetmap.org/way/662194723', null)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, elevation = excluded.elevation, info = excluded.info, updated_at = now();

commit;
