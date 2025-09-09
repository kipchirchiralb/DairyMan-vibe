function groupAndExtractLatest(records) {
  // Step 1: Group records by animal_tag
  const grouped = records.reduce((acc, record) => {
    const tag = record.animal_tag;
    if (!acc[tag]) {
      acc[tag] = {
        animal_name: record.animal_name,
        production_dates: [],
        total_daily_productions: [],
      };
    }

    acc[tag].production_dates.push(new Date(record.production_date));
    acc[tag].total_daily_productions.push(record.total_daily_production);

    return acc;
  }, {});

  // Step 2: Sort each group's records by date and keep only last 15
  for (const tag in grouped) {
    // Combine dates and productions into one array for sorting
    const combined = grouped[tag].production_dates.map((date, i) => ({
      date,
      production: grouped[tag].total_daily_productions[i],
    }));

    // Sort descending by date
    combined.sort((a, b) => b.date - a.date);

    // Slice last 15
    const latest15 = combined.slice(0, 15);

    // Rebuild arrays
    grouped[tag].production_dates = latest15.map((item) =>
      item.date.toLocaleDateString()
    );
    grouped[tag].total_daily_productions = latest15.map(
      (item) => item.production
    );
  }

  return grouped;
}

// Example usage with your data:
const data = [
  {
    animal_tag: "A002",
    animal_name: "Pendo",
    production_date: "2023-08-01T21:00:00.000Z",
    total_daily_production: 12.7,
    milking_sessions: 1,
    farm_name: "Green Pastures",
    unit: "Liters",
  },
  {
    animal_tag: "A003",
    animal_name: "Kadogo",
    production_date: "2023-08-01T21:00:00.000Z",
    total_daily_production: 10,
    milking_sessions: 1,
    farm_name: "Green Pastures",
    unit: "Liters",
  },
  {
    animal_tag: "A005",
    animal_name: "Lelmet",
    production_date: "2023-08-01T21:00:00.000Z",
    total_daily_production: 8.5,
    milking_sessions: 1,
    farm_name: "Green Pastures",
    unit: "Liters",
  },
  {
    animal_tag: "A003",
    animal_name: "Kadogo",
    production_date: "2023-07-31T21:00:00.000Z",
    total_daily_production: 22.7,
    milking_sessions: 2,
    farm_name: "Green Pastures",
    unit: "Liters",
  },
  {
    animal_tag: "A005",
    animal_name: "Lelmet",
    production_date: "2023-07-31T21:00:00.000Z",
    total_daily_production: 8.7,
    milking_sessions: 1,
    farm_name: "Green Pastures",
    unit: "Liters",
  },
];

console.log(groupAndExtractLatest(data));
