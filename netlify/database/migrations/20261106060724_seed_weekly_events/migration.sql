-- Starter weekly community events hosted by Pacemate (host_id is NULL).
-- starts_at is the first occurrence; the API rolls weekly events forward to the next date.
INSERT INTO "events" ("host_id", "city", "kind", "title", "description", "location", "starts_at", "timezone", "weekly") VALUES
(NULL, 'Lisbon', 'Run', 'Sunrise run by the river', 'Easy 6 km along the Tagus, then coffee. All paces welcome, nobody gets dropped.', 'Belem waterfront, by the Padrao dos Descobrimentos', '2026-11-07 07:30:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Lisbon', 'Climb', 'Climb and coffee', 'Bouldering for every level. Shoes can be rented at the desk.', 'Indoor wall, Alcantara', '2026-11-11 18:30:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Lisbon', 'Surf', 'Cowork then surf', 'Laptops from 13:00 at the beach cafe, paddle out at 15:00.', 'Carcavelos beach', '2026-11-13 15:00:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Bali', 'Run', 'Beach run and breakfast', '5 km on the sand at low tide, breakfast after.', 'Batu Bolong, Canggu', '2026-11-08 06:45:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Bali', 'Padel', 'Padel mixer', 'Rotating doubles, so you play with everyone. Rackets available.', 'Berawa padel club', '2026-11-10 17:00:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Bali', 'Yoga', 'Yoga and cowork', 'Vinyasa flow, then a quiet working morning together.', 'Ubud', '2026-11-12 09:00:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Medellin', 'Ride', 'Hill ride', 'Steady climb with regroups at the top. Road or gravel bikes.', 'Alto de Las Palmas, start at Parque El Poblado', '2026-11-07 06:30:00 America/Bogota', 'America/Bogota', true),
(NULL, 'Medellin', 'Run', '5k social run', 'Conversational pace, drinks after for anyone who wants.', 'Parque Lleras', '2026-11-10 19:00:00 America/Bogota', 'America/Bogota', true),
(NULL, 'Barcelona', 'Run', 'Beach 5k social', 'Flat out-and-back along the promenade.', 'Barceloneta, by the W hotel', '2026-11-10 19:00:00 Europe/Madrid', 'Europe/Madrid', true),
(NULL, 'Berlin', 'Ride', 'Sunday gravel loop', '60 km through Grunewald at a chatty pace.', 'S-Bahn Grunewald', '2026-11-08 10:00:00 Europe/Berlin', 'Europe/Berlin', true),
(NULL, 'Mexico City', 'Padel', 'Padel night', 'Mixed levels, rotating partners.', 'Condesa', '2026-11-12 19:30:00 America/Mexico_City', 'America/Mexico_City', true);
