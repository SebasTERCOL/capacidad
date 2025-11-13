-- Eliminar entrada duplicada que causa conteo doble de CNCA30-CMB
DELETE FROM bom 
WHERE product_id = 'CCA30' 
AND component_id = 'CNCA30-CMB';