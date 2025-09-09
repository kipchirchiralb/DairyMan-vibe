function getProductionRecordsForFarmer(farmer_id) {
  return `
  SELECT 
    animal.animal_tag,
    animal.name as animal_name,
    milkproduction.production_date,
    SUM(milkproduction.quantity) as total_daily_production,
    COUNT(*) as milking_sessions,
    farmers.farm_name,
    milkproduction.unit
FROM milkproduction 
JOIN animal ON milkproduction.animal_id = animal.animal_tag
JOIN farmers ON animal.owner_id = farmers.farmer_id
WHERE farmers.farmer_id = ${farmer_id}
GROUP BY animal.animal_tag, animal.name, milkproduction.production_date, farmers.farm_name, milkproduction.unit
ORDER BY milkproduction.production_date DESC, total_daily_production DESC;`;
}

function getAnimalsProductionsForFarmer(farmer_id) {
  return `SELECT 
    f.farm_name,
    f.fullname AS farmer_name,
    a.animal_tag,
    a.name AS animal_name,
    SUM(mp.quantity) AS total_production,
    mp.unit
FROM farmers f
JOIN animal a ON f.farmer_id = a.owner_id
JOIN milkproduction mp ON a.animal_tag = mp.animal_id
WHERE f.farmer_id = ${farmer_id}
GROUP BY f.farm_name, f.fullname, a.animal_tag, a.name, mp.unit
`;
}

module.exports = {
  getProductionRecordsForFarmer,
  getAnimalsProductionsForFarmer,
};
