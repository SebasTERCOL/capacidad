-- Aumentar SAM en 10% para el proceso de Corte (id_process = 10)
UPDATE machines_processes
SET sam = sam * 1.10
WHERE id_process = 10;