const express = require("express");
const path = require("path");
const app = express();
const mysql = require("mysql");
const dbConn = mysql.createConnection({
  host: "localhost",
  database: "dairyman",
  user: "root",
  password: "password",
  port: 3307,
});
const bcrypt = require("bcrypt");
const salt = bcrypt.genSaltSync(13);
const session = require("express-session");
const sqlQueries = require("./sqlStatement.js");
const utils = require("./utils.js");

// middleware
app.use(express.static(path.join(__dirname, "public"))); // static files will be served from the 'public' directory/folder
app.use(express.urlencoded({ extended: true })); // body parser to decrypt incoming data to req.body
app.use(
  session({
    secret: "ojfsklfsmkfsmfsjfskjkfsjfkjkfjs",
    resave: false,
    saveUninitialized: true,
  })
);
// authorization middleware
const protectedRoutes = [
  "/dashboard",
  "/expenses",
  "/animal-profiles",
  "/new-animal",
  "/update-animal-status",
  "/add-expense",
  "/vaccination",
  "/add-vaccination",
  "/medication",
  "/add-medication",
  "/feed-consumption",
  "/add-feed-consumption",
  "/farmer-profile",
  "/update-farmer-profile",
  "/settings",
  "/update-password",
  "/milk-production",
  "/add-milk-production",
];
app.use((req, res, next) => {
  if (protectedRoutes.includes(req.path)) {
    // check if user is logged in
    if (req.session && req.session.farmer) {
      console.log(req.session.farmer);

      res.locals.farmer = req.session.farmer;
      next();
    } else {
      res.redirect("/login?message=unauthorized");
    }
  } else {
    next();
  }
});

// root route/landing page/index route
app.get("/", (req, res) => {
  res.render("index.ejs");
});
// Authentication routes
app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  const message = req.query.message;
  if (message === "exists") {
    res.locals.message = "Email already exists. Please login.";
  } else if (message === "success") {
    res.locals.message = "Registration successful. Please login.";
  } else if (message === "invalid") {
    res.locals.message = "Invalid email or password. Try again";
  } else if (message === "unauthorized") {
    res.locals.message = "Your are unauthorized to access that page.";
  }
  res.render("login.ejs");
});
app.post("/register", (req, res) => {
  const { email, phone, password, fullname, farm_location, farm_name, county } =
    req.body;
  const hashedPassword = bcrypt.hashSync(password, salt);
  const insertFarmerStatement = `INSERT INTO farmers(fullname,phone,email,password,farm_name,farm_location,county) VALUES("${fullname}","${phone}","${email}","${hashedPassword}","${farm_name}","${farm_location}","${county}")`;
  const checkEmailStatement = `SELECT email FROM farmers WHERE email="${email}"`;

  dbConn.query(checkEmailStatement, (sqlErr, data) => {
    if (sqlErr) return res.status(500).send("Server Error");
    if (data.length > 0) {
      res.redirect("/login?message=exists");
    } else {
      dbConn.query(insertFarmerStatement, (insertError) => {
        if (insertError) {
          res
            .status(500)
            .send(
              "Error while registering farmer. If this persists contact admin"
            );
        } else {
          res.redirect("/login?message=success");
        }
      });
    }
  });
});

app.post("/login", (req, res) => {
  console.log(req.body);
  const { email, password } = req.body;
  const checkEmailStatement = `SELECT farmer_id,email,fullname,password FROM farmers WHERE email="${email}"`;
  dbConn.query(checkEmailStatement, (sqlErr, data) => {
    if (sqlErr) return res.status(500).send("Server Error");
    if (data.length === 0) {
      res.redirect("/login?message=invalid");
    } else {
      const user = data[0];
      console.log(user);
      const passwordMatch = bcrypt.compareSync(password, user.password); // bcrypt to compare hashed passwords
      if (passwordMatch) {
        // create a session and redirect to dashboard
        req.session.farmer = user; // setting session for a farmer - a cookie is set in the req/browser
        res.redirect("/dashboard");
      } else {
        res.redirect("/login?message=invalid");
      }
    }
  });
});
// console.log(bcrypt.hashSync("john123", salt));

console.log(sqlQueries.getProductionRecordsForFarmer(4));

// Dashboard route
app.get("/dashboard", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;

  // Get production data for charts
  dbConn.query(
    sqlQueries.getProductionRecordsForFarmer(farmerId),
    (sqlErr, data) => {
      if (sqlErr) return res.status(500).send("Server Error!" + sqlErr);
      const groupedData = utils.groupAndExtractLatest(data);

      // Get additional dashboard statistics
      const queries = [
        // Total animals count
        `SELECT COUNT(*) as total_animals FROM Animal WHERE owner_id = ${farmerId} AND status = 'Alive'`,

        // Total milk production (last 30 days)
        `SELECT SUM(mp.quantity) as total_production 
         FROM MilkProduction mp 
         JOIN Animal a ON mp.animal_id = a.animal_tag 
         WHERE a.owner_id = ${farmerId} 
         AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

        // Average daily production
        `SELECT AVG(daily_total) as avg_daily FROM (
          SELECT DATE(mp.production_date) as production_date, SUM(mp.quantity) as daily_total 
          FROM MilkProduction mp 
          JOIN Animal a ON mp.animal_id = a.animal_tag 
          WHERE a.owner_id = ${farmerId} 
          AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY DATE(mp.production_date)
        ) as daily_production`,

        // Total expenses (last 30 days)
        `SELECT SUM(amount) as total_expenses FROM Expenses WHERE farmer_id = ${farmerId} AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

        // Recent activities (last 5)
        `(SELECT 'milk_production' as type, mp.production_date as activity_date, 
                  CONCAT('Milk production: ', SUM(mp.quantity), 'L from ', COUNT(DISTINCT mp.animal_id), ' animals') as description,
                  GROUP_CONCAT(DISTINCT a.name) as animal_name
           FROM MilkProduction mp 
           JOIN Animal a ON mp.animal_id = a.animal_tag 
           WHERE a.owner_id = ${farmerId} 
           GROUP BY mp.production_date 
           ORDER BY mp.production_date DESC 
           LIMIT 3)
           UNION ALL
           (SELECT 'expense' as type, expense_date as activity_date, 
                   CONCAT('Expense: ', expense_type, ' - KSh ', amount) as description,
                   NULL as animal_name
            FROM Expenses 
            WHERE farmer_id = ${farmerId} 
            ORDER BY expense_date DESC 
            LIMIT 2)
           ORDER BY activity_date DESC 
           LIMIT 5`,
      ];

      // Execute all queries
      Promise.all(
        queries.map(
          (query) =>
            new Promise((resolve, reject) => {
              dbConn.query(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            })
        )
      )
        .then((results) => {
          const [
            animalsResult,
            productionResult,
            avgResult,
            expensesResult,
            activitiesResult,
          ] = results;

          res.render("dashboard.ejs", {
            groupedData,
            stats: {
              totalAnimals: animalsResult[0].total_animals || 0,
              totalProduction: productionResult[0].total_production || 0,
              avgDailyProduction: avgResult[0].avg_daily || 0,
              totalExpenses: expensesResult[0].total_expenses || 0,
            },
            recentActivities: activitiesResult || [],
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).send("Server Error!");
        });
    }
  );
});

// Vaccination Dashboard route
app.get("/vaccination", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "vaccination_added") {
    successMessage = "Vaccination record added successfully!";
  }

  // Get vaccination statistics and records
  const queries = [
    // Total vaccinations count
    `SELECT COUNT(*) as total_vaccinations 
     FROM Vaccination v 
     JOIN Animal a ON v.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId}`,

    // Vaccinations due soon (next 30 days)
    `SELECT COUNT(*) as due_soon 
     FROM Vaccination v 
     JOIN Animal a ON v.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND v.next_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,

    // Recent vaccinations (last 15)
    `SELECT v.*, a.name as animal_name, a.animal_tag
     FROM Vaccination v 
     JOIN Animal a ON v.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     ORDER BY v.date_administered DESC 
     LIMIT 15`,

    // Animals for dropdown
    `SELECT animal_tag, name FROM Animal WHERE owner_id = ${farmerId} AND status = 'Alive' ORDER BY name`,
  ];

  Promise.all(
    queries.map(
      (query) =>
        new Promise((resolve, reject) => {
          dbConn.query(query, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        })
    )
  )
    .then((results) => {
      const [totalResult, dueResult, vaccinationsResult, animalsResult] =
        results;

      res.render("vaccination.ejs", {
        totalVaccinations: totalResult[0].total_vaccinations || 0,
        dueSoon: dueResult[0].due_soon || 0,
        recentVaccinations: vaccinationsResult || [],
        animals: animalsResult || [],
        successMessage,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send("Server Error!");
    });
});

// Add vaccination route
app.post("/add-vaccination", (req, res) => {
  const { animal_id, vaccine_name, date_administered, next_due_date, notes } =
    req.body;

  // Validate required fields
  if (!animal_id || !vaccine_name || !date_administered) {
    return res.status(400).send("Missing required fields");
  }

  // Insert vaccination into database
  const insertVaccinationQuery = `INSERT INTO Vaccination (animal_id, vaccine_name, date_administered, next_due_date, notes) VALUES (?, ?, ?, ?, ?)`;

  dbConn.query(
    insertVaccinationQuery,
    [
      animal_id,
      vaccine_name,
      date_administered,
      next_due_date || null,
      notes || null,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      res.redirect("/vaccination?message=vaccination_added");
    }
  );
});

// Medication Dashboard route
app.get("/medication", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "medication_added") {
    successMessage = "Medication record added successfully!";
  }

  // Get medication statistics and records
  const queries = [
    // Total medications count
    `SELECT COUNT(*) as total_medications 
     FROM Medication m 
     JOIN Animal a ON m.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId}`,

    // Active medications (ongoing treatments)
    `SELECT COUNT(*) as active_medications 
     FROM Medication m 
     JOIN Animal a ON m.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND (m.end_date IS NULL OR m.end_date > CURDATE())`,

    // Recent medications (last 15)
    `SELECT m.*, a.name as animal_name, a.animal_tag
     FROM Medication m 
     JOIN Animal a ON m.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     ORDER BY m.start_date DESC 
     LIMIT 15`,

    // Animals for dropdown
    `SELECT animal_tag, name FROM Animal WHERE owner_id = ${farmerId} AND status = 'Alive' ORDER BY name`,
  ];

  Promise.all(
    queries.map(
      (query) =>
        new Promise((resolve, reject) => {
          dbConn.query(query, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        })
    )
  )
    .then((results) => {
      const [totalResult, activeResult, medicationsResult, animalsResult] =
        results;

      res.render("medication.ejs", {
        totalMedications: totalResult[0].total_medications || 0,
        activeMedications: activeResult[0].active_medications || 0,
        recentMedications: medicationsResult || [],
        animals: animalsResult || [],
        successMessage,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send("Server Error!");
    });
});

// Add medication route
app.post("/add-medication", (req, res) => {
  const {
    animal_id,
    medication_name,
    dose,
    start_date,
    end_date,
    veterinary_name,
    veterinary_remarks,
    notes,
  } = req.body;

  // Validate required fields
  if (!animal_id || !medication_name || !start_date) {
    return res.status(400).send("Missing required fields");
  }

  // Insert medication into database
  const insertMedicationQuery = `INSERT INTO Medication (animal_id, medication_name, dose, start_date, end_date, veterinary_name, veterinary_remarks, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  dbConn.query(
    insertMedicationQuery,
    [
      animal_id,
      medication_name,
      dose || null,
      start_date,
      end_date || null,
      veterinary_name || null,
      veterinary_remarks || null,
      notes || null,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      res.redirect("/medication?message=medication_added");
    }
  );
});

// Feed Consumption Dashboard route
app.get("/feed-consumption", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "feed_added") {
    successMessage = "Feed consumption record added successfully!";
  }

  // Get feed consumption statistics and records
  const queries = [
    // Total feed consumption count
    `SELECT COUNT(*) as total_feed_records 
     FROM FeedConsumption fc 
     JOIN Animal a ON fc.animalfed = a.animal_tag 
     WHERE a.owner_id = ${farmerId}`,

    // Total feed cost (last 30 days)
    `SELECT SUM(fc.cost) as total_feed_cost 
     FROM FeedConsumption fc 
     JOIN Animal a ON fc.animalfed = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND fc.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

    // Average daily feed cost
    `SELECT AVG(daily_total) as avg_daily_cost FROM (
      SELECT DATE(fc.date) as feed_date, SUM(fc.cost) as daily_total 
      FROM FeedConsumption fc 
      JOIN Animal a ON fc.animalfed = a.animal_tag 
      WHERE a.owner_id = ${farmerId} 
      AND fc.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(fc.date)
    ) as daily_feed`,

    // Recent feed consumption (last 15)
    `SELECT fc.*, a.name as animal_name, a.animal_tag
     FROM FeedConsumption fc 
     JOIN Animal a ON fc.animalfed = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     ORDER BY fc.date DESC 
     LIMIT 15`,

    // Animals for dropdown
    `SELECT animal_tag, name FROM Animal WHERE owner_id = ${farmerId} AND status = 'Alive' ORDER BY name`,
  ];

  Promise.all(
    queries.map(
      (query) =>
        new Promise((resolve, reject) => {
          dbConn.query(query, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        })
    )
  )
    .then((results) => {
      const [totalResult, costResult, avgResult, feedResult, animalsResult] =
        results;

      res.render("feed-consumption.ejs", {
        totalFeedRecords: totalResult[0].total_feed_records || 0,
        totalFeedCost: costResult[0].total_feed_cost || 0,
        avgDailyCost: avgResult[0].avg_daily_cost || 0,
        recentFeedConsumption: feedResult || [],
        animals: animalsResult || [],
        successMessage,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send("Server Error!");
    });
});

// Add feed consumption route
app.post("/add-feed-consumption", (req, res) => {
  const { animalfed, quantity, type, cost } = req.body;

  // Validate required fields
  if (!animalfed || !quantity || !type || !cost) {
    return res.status(400).send("Missing required fields");
  }

  // Validate quantity and cost are positive numbers
  if (isNaN(quantity) || parseFloat(quantity) <= 0) {
    return res.status(400).send("Quantity must be a positive number");
  }
  if (isNaN(cost) || parseFloat(cost) <= 0) {
    return res.status(400).send("Cost must be a positive number");
  }

  // Insert feed consumption into database
  const insertFeedQuery = `INSERT INTO FeedConsumption (animalfed, quantity, type, cost, date) VALUES (?, ?, ?, ?, NOW())`;

  dbConn.query(
    insertFeedQuery,
    [animalfed, parseFloat(quantity), type, parseFloat(cost)],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      res.redirect("/feed-consumption?message=feed_added");
    }
  );
});

// Farmer Profile route
app.get("/farmer-profile", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "profile_updated") {
    successMessage = "Profile updated successfully!";
  }

  // Get farmer profile data
  dbConn.query(
    `SELECT * FROM Farmers WHERE farmer_id = ${farmerId}`,
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error!");
      }

      if (result.length === 0) {
        return res.status(404).send("Farmer not found");
      }

      const farmer = result[0];

      // Get additional statistics
      const statsQueries = [
        // Total animals
        `SELECT COUNT(*) as total_animals FROM Animal WHERE owner_id = ${farmerId}`,

        // Total milk production (last 30 days)
        `SELECT SUM(mp.quantity) as total_production 
         FROM MilkProduction mp 
         JOIN Animal a ON mp.animal_id = a.animal_tag 
         WHERE a.owner_id = ${farmerId} 
         AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

        // Total expenses (last 30 days)
        `SELECT SUM(amount) as total_expenses FROM Expenses WHERE farmer_id = ${farmerId} AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

        // Registration date
        `SELECT registration_date FROM Farmers WHERE farmer_id = ${farmerId}`,
      ];

      Promise.all(
        statsQueries.map(
          (query) =>
            new Promise((resolve, reject) => {
              dbConn.query(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            })
        )
      )
        .then((statsResults) => {
          const [animalsResult, productionResult, expensesResult, regResult] =
            statsResults;

          res.render("farmer-profile.ejs", {
            farmer,
            stats: {
              totalAnimals: animalsResult[0].total_animals || 0,
              totalProduction: productionResult[0].total_production || 0,
              totalExpenses: expensesResult[0].total_expenses || 0,
              registrationDate: regResult[0].registration_date,
            },
            successMessage,
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).send("Server Error!");
        });
    }
  );
});

// Update farmer profile route
app.post("/update-farmer-profile", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const { fullname, phone, email, county, farm_location, farm_name } = req.body;

  // Validate required fields
  if (!fullname || !email) {
    return res.status(400).send("Name and email are required");
  }

  // Update farmer profile
  const updateQuery = `UPDATE Farmers SET fullname = ?, phone = ?, email = ?, county = ?, farm_location = ?, farm_name = ? WHERE farmer_id = ?`;

  dbConn.query(
    updateQuery,
    [
      fullname,
      phone || null,
      email,
      county || null,
      farm_location || null,
      farm_name || null,
      farmerId,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      // Update session data
      req.session.farmer.fullname = fullname;
      req.session.farmer.email = email;
      req.session.farmer.phone = phone;
      req.session.farmer.county = county;
      req.session.farmer.farm_location = farm_location;
      req.session.farmer.farm_name = farm_name;

      res.redirect("/farmer-profile?message=profile_updated");
    }
  );
});

// Settings route
app.get("/settings", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "password_updated") {
    successMessage = "Password updated successfully!";
  }

  res.render("settings.ejs", {
    farmer: req.session.farmer,
    successMessage,
  });
});

// Update password route
app.post("/update-password", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const { current_password, new_password, confirm_password } = req.body;

  // Validate required fields
  if (!current_password || !new_password || !confirm_password) {
    return res.status(400).send("All password fields are required");
  }

  // Validate new password confirmation
  if (new_password !== confirm_password) {
    return res.status(400).send("New passwords do not match");
  }

  // Validate new password length
  if (new_password.length < 6) {
    return res
      .status(400)
      .send("New password must be at least 6 characters long");
  }

  // Get current password hash
  dbConn.query(
    `SELECT password FROM Farmers WHERE farmer_id = ${farmerId}`,
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error!");
      }

      if (result.length === 0) {
        return res.status(404).send("Farmer not found");
      }

      const currentHash = result[0].password;

      // Verify current password
      bcrypt.compare(current_password, currentHash, (err, isMatch) => {
        if (err) {
          console.log(err);
          return res.status(500).send("Server Error!");
        }

        if (!isMatch) {
          return res.status(400).send("Current password is incorrect");
        }

        // Hash new password
        bcrypt.hash(new_password, 13, (err, newHash) => {
          if (err) {
            console.log(err);
            return res.status(500).send("Server Error!");
          }

          // Update password
          dbConn.query(
            `UPDATE Farmers SET password = ? WHERE farmer_id = ?`,
            [newHash, farmerId],
            (err, result) => {
              if (err) {
                console.log(err);
                return res.status(500).send("Server Error: " + err);
              }

              res.redirect("/settings?message=password_updated");
            }
          );
        });
      });
    }
  );
});

// Milk Production Dashboard route
app.get("/milk-production", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;
  const message = req.query.message;
  let successMessage = null;

  if (message === "production_added") {
    successMessage = "Milk production record added successfully!";
  }

  // Get milk production statistics and records
  const queries = [
    // Total production count
    `SELECT COUNT(*) as total_production_records 
     FROM MilkProduction mp 
     JOIN Animal a ON mp.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId}`,

    // Total milk production (last 30 days)
    `SELECT SUM(mp.quantity) as total_milk_production 
     FROM MilkProduction mp 
     JOIN Animal a ON mp.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,

    // Average daily production
    `SELECT AVG(daily_total) as avg_daily_production FROM (
      SELECT DATE(mp.production_date) as production_date, SUM(mp.quantity) as daily_total 
      FROM MilkProduction mp 
      JOIN Animal a ON mp.animal_id = a.animal_tag 
      WHERE a.owner_id = ${farmerId} 
      AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(mp.production_date)
    ) as daily_production`,

    // Best performing animal (last 30 days)
    `SELECT a.name as animal_name, a.animal_tag, SUM(mp.quantity) as total_production
     FROM MilkProduction mp 
     JOIN Animal a ON mp.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY a.animal_tag, a.name
     ORDER BY total_production DESC
     LIMIT 1`,

    // Recent milk production (last 20)
    `SELECT mp.*, a.name as animal_name, a.animal_tag
     FROM MilkProduction mp 
     JOIN Animal a ON mp.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     ORDER BY mp.production_date DESC, mp.production_time DESC 
     LIMIT 20`,

    // Animals for dropdown
    `SELECT animal_tag, name FROM Animal WHERE owner_id = ${farmerId} AND status = 'Alive' ORDER BY name`,

    // Production by animal (for charts)
    `SELECT a.name as animal_name, a.animal_tag, 
            DATE(mp.production_date) as production_date,
            SUM(mp.quantity) as daily_production
     FROM MilkProduction mp 
     JOIN Animal a ON mp.animal_id = a.animal_tag 
     WHERE a.owner_id = ${farmerId} 
     AND mp.production_date >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
     GROUP BY a.animal_tag, a.name, DATE(mp.production_date)
     ORDER BY production_date DESC, daily_production DESC`,
  ];

  Promise.all(
    queries.map(
      (query) =>
        new Promise((resolve, reject) => {
          dbConn.query(query, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        })
    )
  )
    .then((results) => {
      const [
        totalResult,
        productionResult,
        avgResult,
        bestAnimalResult,
        recentResult,
        animalsResult,
        chartDataResult,
      ] = results;

      // Process chart data
      const chartData = {};
      chartDataResult.forEach((record) => {
        if (!chartData[record.animal_tag]) {
          chartData[record.animal_tag] = {
            animal_name: record.animal_name,
            production_dates: [],
            daily_productions: [],
          };
        }
        chartData[record.animal_tag].production_dates.push(
          record.production_date
        );
        chartData[record.animal_tag].daily_productions.push(
          record.daily_production
        );
      });

      // Process animals to show original tag names (without farmer ID prefix)
      const processedAnimals = (animalsResult || []).map((animal) => {
        const originalTag = animal.animal_tag.includes("_")
          ? animal.animal_tag.split("_").slice(1).join("_")
          : animal.animal_tag;
        return {
          ...animal,
          display_tag: originalTag,
          full_tag: animal.animal_tag,
        };
      });

      // Process recent production to show display tags
      const processedRecentProduction = (recentResult || []).map(
        (production) => {
          const originalTag = production.animal_tag.includes("_")
            ? production.animal_tag.split("_").slice(1).join("_")
            : production.animal_tag;
          return {
            ...production,
            display_tag: originalTag,
            full_tag: production.animal_tag,
          };
        }
      );

      res.render("milk-production.ejs", {
        totalProductionRecords: totalResult[0].total_production_records || 0,
        totalMilkProduction: productionResult[0].total_milk_production || 0,
        avgDailyProduction: avgResult[0].avg_daily_production || 0,
        bestAnimal: bestAnimalResult[0] || null,
        recentProduction: processedRecentProduction,
        animals: processedAnimals,
        chartData: chartData,
        successMessage,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send("Server Error!");
    });
});

// Add milk production route
app.post("/add-milk-production", (req, res) => {
  const { animal_id, production_date, production_time, quantity, quality } =
    req.body;

  // Validate required fields
  if (!animal_id || !production_date || !production_time || !quantity) {
    return res.status(400).send("Missing required fields");
  }

  // Validate quantity is a positive number
  if (isNaN(quantity) || parseFloat(quantity) <= 0) {
    return res.status(400).send("Quantity must be a positive number");
  }

  // Insert milk production into database
  const insertProductionQuery = `INSERT INTO MilkProduction (animal_id, production_date, production_time, quantity, quality, unit) VALUES (?, ?, ?, ?, ?, 'Liters')`;

  dbConn.query(
    insertProductionQuery,
    [
      animal_id,
      production_date,
      production_time,
      parseFloat(quantity),
      quality || null,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      res.redirect("/milk-production?message=production_added");
    }
  );
});

app.get("/animal-profiles", (req, res) => {
  const message = req.query.message;
  const error = req.query.error;
  const errorMsg = req.query.message;

  let successMessage = null;
  let errorMessage = null;

  if (message === "status_updated") {
    successMessage = "Animal status updated successfully!";
  } else if (message === "animal_added") {
    successMessage = "Animal added successfully!";
  }

  if (error === "duplicate_entry") {
    errorMessage = decodeURIComponent(errorMsg || "Duplicate entry detected.");
  } else if (error === "validation_error") {
    errorMessage = decodeURIComponent(errorMsg || "Validation error occurred.");
  } else if (error === "database_error") {
    errorMessage = decodeURIComponent(errorMsg || "Database error occurred.");
  }

  dbConn.query(
    sqlQueries.getAnimalsProductionsForFarmer(req.session.farmer.farmer_id),
    (sqlErr, animals) => {
      if (sqlErr) return res.status(500).send("Server Error!" + sqlErr);
      console.log(utils.getChartData(animals));

      dbConn.query(
        `select * from animal WHERE owner_id=${req.session.farmer.farmer_id}`,
        (err, allAnimalsForFarmer) => {
          // Process animals to show original tag names (without farmer ID prefix)
          const processedAnimals = allAnimalsForFarmer.map((animal) => {
            const originalTag = animal.animal_tag.includes("_")
              ? animal.animal_tag.split("_").slice(1).join("_")
              : animal.animal_tag;
            return {
              ...animal,
              display_tag: originalTag,
              full_tag: animal.animal_tag,
            };
          });

          res.render("animal-profiles.ejs", {
            animals: utils.getChartData(animals),
            allAnimalsForFarmer: processedAnimals,
            successMessage,
            errorMessage,
          });
        }
      );
    }
  );
});

app.get("/expenses", (req, res) => {
  const message = req.query.message;
  let successMessage = null;

  if (message === "expense_added") {
    successMessage = "Expense recorded successfully!";
  }

  // Get total expenses for the farmer
  dbConn.query(
    `SELECT SUM(amount) as total_expenses FROM Expenses WHERE farmer_id = ${req.session.farmer.farmer_id}`,
    (err, totalResult) => {
      if (err) return res.status(500).send("Server Error!" + err);

      // Get average daily expenses (last 30 days)
      dbConn.query(
        `SELECT AVG(daily_total) as avg_daily FROM (
          SELECT DATE(expense_date) as expense_date, SUM(amount) as daily_total 
          FROM Expenses 
          WHERE farmer_id = ${req.session.farmer.farmer_id} 
          AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY DATE(expense_date)
        ) as daily_expenses`,
        (err, avgResult) => {
          if (err) return res.status(500).send("Server Error!" + err);

          // Get last 15 expenses
          dbConn.query(
            `SELECT * FROM Expenses 
             WHERE farmer_id = ${req.session.farmer.farmer_id} 
             ORDER BY expense_date DESC, expense_id DESC 
             LIMIT 15`,
            (err, expenses) => {
              if (err) return res.status(500).send("Server Error!" + err);

              res.render("expenses.ejs", {
                totalExpenses: totalResult[0].total_expenses || 0,
                avgDailyExpenses: avgResult[0].avg_daily || 0,
                recentExpenses: expenses,
                successMessage,
              });
            }
          );
        }
      );
    }
  );
});

app.post("/new-animal", (req, res) => {
  let { animal_tag, dob, purchase_date, breed, name, source, gender, status } =
    req.body;

  // Validate required fields
  if (!animal_tag || !name || !breed || !gender || !status) {
    return res.redirect(
      "/animal-profiles?error=validation_error&message=" +
        encodeURIComponent(
          "Missing required fields. Please fill in all required information."
        )
    );
  }

  // Validate animal tag format
  if (animal_tag.length < 2) {
    return res.redirect(
      "/animal-profiles?error=validation_error&message=" +
        encodeURIComponent("Animal tag must be at least 2 characters long.")
    );
  }

  // Auto-prefix farmer ID to animal tag to prevent conflicts
  const farmerId = req.session.farmer.farmer_id;
  const prefixedAnimalTag = `${farmerId}_${animal_tag}`;

  purchase_date.length == 0
    ? (purchase_date = "2000-01-01")
    : (purchase_date = purchase_date);
  console.log(req.body);

  const insertAnimalStatement = `INSERT INTO animal(animal_tag,name,dob,purchase_date,breed,status,source,gender,owner_id) VALUES("${prefixedAnimalTag}","${name}","${dob}","${purchase_date}","${breed}","${status}","${source}","${gender}", ${farmerId})`;

  dbConn.query(insertAnimalStatement, (sqlErr) => {
    if (sqlErr) {
      console.log(sqlErr);

      // Handle duplicate entry error specifically
      if (sqlErr.code === "ER_DUP_ENTRY") {
        return res.redirect(
          "/animal-profiles?error=duplicate_entry&message=" +
            encodeURIComponent(
              "Animal tag '" +
                animal_tag +
                "' already exists. Please use a different tag."
            )
        );
      }

      // Handle other database errors
      return res.redirect(
        "/animal-profiles?error=database_error&message=" +
          encodeURIComponent("Database error occurred. Please try again.")
      );
    }
    res.redirect("/animal-profiles?message=animal_added");
  });
});

// Update animal status route
app.post("/update-animal-status", (req, res) => {
  const { animal_id, new_status, status_date, status_notes } = req.body;

  // Validate that the animal belongs to the current farmer
  const checkOwnershipQuery = `SELECT owner_id FROM animal WHERE animal_tag = "${animal_id}"`;

  dbConn.query(checkOwnershipQuery, (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Server Error: " + err);
    }

    if (result.length === 0) {
      return res.status(404).send("Animal not found");
    }

    if (result[0].owner_id !== req.session.farmer.farmer_id) {
      return res
        .status(403)
        .send("Unauthorized: You can only update your own animals");
    }

    // Update the animal status
    const updateStatusQuery = `UPDATE animal SET status = "${new_status}" WHERE animal_tag = "${animal_id}"`;

    dbConn.query(updateStatusQuery, (updateErr) => {
      if (updateErr) {
        console.log(updateErr);
        return res.status(500).send("Server Error: " + updateErr);
      }

      // If status is changed to Dead, add a record to the Losses table
      if (new_status === "Dead") {
        const insertLossQuery = `INSERT INTO losses (animal_id, loss_type, date, notes) VALUES ("${animal_id}", "Death", "${status_date}", "${
          status_notes || "Status updated to Dead"
        }")`;

        dbConn.query(insertLossQuery, (lossErr) => {
          if (lossErr) {
            console.log("Warning: Could not add loss record:", lossErr);
          }
        });
      }

      // If status is changed to Sold, add a record to the Sales table
      if (new_status === "Sold") {
        const insertSaleQuery = `INSERT INTO sales (sale_date, sale_type, item_description, price_per_unit, quantity, unit, farmer_id) VALUES ("${status_date}", "Animal", "Sale of animal ${animal_id}", 0, 1, "Animal", ${req.session.farmer.farmer_id})`;

        dbConn.query(insertSaleQuery, (saleErr) => {
          if (saleErr) {
            console.log("Warning: Could not add sale record:", saleErr);
          }
        });
      }

      res.redirect("/animal-profiles?message=status_updated");
    });
  });
});

// Add expense route
app.post("/add-expense", (req, res) => {
  const { expense_date, expense_type, description, amount } = req.body;

  // Validate required fields
  if (!expense_date || !expense_type || !amount) {
    return res.status(400).send("Missing required fields");
  }

  // Validate amount is a positive number
  if (isNaN(amount) || parseFloat(amount) <= 0) {
    return res.status(400).send("Amount must be a positive number");
  }

  // Insert expense into database
  const insertExpenseQuery = `INSERT INTO Expenses (expense_date, expense_type, description, amount, farmer_id) VALUES (?, ?, ?, ?, ?)`;

  dbConn.query(
    insertExpenseQuery,
    [
      expense_date,
      expense_type,
      description || null,
      parseFloat(amount),
      req.session.farmer.farmer_id,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Server Error: " + err);
      }

      res.redirect("/expenses?message=expense_added");
    }
  );
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error occurred:", err);

  // Handle specific error types
  if (err.code === "ER_DUP_ENTRY") {
    // Handle duplicate entry errors
    const field = err.sqlMessage.match(/for key '(.+?)'/);
    let errorMessage = "Duplicate entry detected. ";

    if (field && field[1]) {
      const keyName = field[1];
      if (keyName.includes("animal_tag") || keyName.includes("PRIMARY")) {
        errorMessage = "Animal tag already exists. Please use a different tag.";
      } else if (keyName.includes("email")) {
        errorMessage =
          "Email address already exists. Please use a different email.";
      } else {
        errorMessage = `Duplicate entry for ${keyName}. Please use a different value.`;
      }
    }

    // If it's an AJAX request or API call, return JSON
    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(400).json({
        error: true,
        message: errorMessage,
        type: "duplicate_entry",
      });
    }

    // For form submissions, redirect with error message
    const referer = req.get("Referer") || "/dashboard";
    return res.redirect(
      `${referer}?error=duplicate_entry&message=${encodeURIComponent(
        errorMessage
      )}`
    );
  }

  // Handle foreign key constraint errors
  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    const errorMessage =
      "Referenced record does not exist. Please check your data.";

    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(400).json({
        error: true,
        message: errorMessage,
        type: "foreign_key_error",
      });
    }

    const referer = req.get("Referer") || "/dashboard";
    return res.redirect(
      `${referer}?error=foreign_key_error&message=${encodeURIComponent(
        errorMessage
      )}`
    );
  }

  // Handle validation errors
  if (err.name === "ValidationError") {
    const errorMessage = "Validation error: " + err.message;

    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(400).json({
        error: true,
        message: errorMessage,
        type: "validation_error",
      });
    }

    const referer = req.get("Referer") || "/dashboard";
    return res.redirect(
      `${referer}?error=validation_error&message=${encodeURIComponent(
        errorMessage
      )}`
    );
  }

  // Handle database connection errors
  if (err.code === "ECONNREFUSED" || err.code === "ER_ACCESS_DENIED_ERROR") {
    console.error("Database connection error:", err);
    return res.status(500).render("500.ejs", {
      error: {
        message: "Database connection failed. Please try again later.",
      },
    });
  }

  // Handle file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    const errorMessage = "File too large. Please choose a smaller file.";

    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(400).json({
        error: true,
        message: errorMessage,
        type: "file_size_error",
      });
    }

    const referer = req.get("Referer") || "/dashboard";
    return res.redirect(
      `${referer}?error=file_size_error&message=${encodeURIComponent(
        errorMessage
      )}`
    );
  }

  // Default error handling
  const errorMessage =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again."
      : err.message;

  if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
    return res.status(500).json({
      error: true,
      message: errorMessage,
      type: "server_error",
    });
  }

  res.status(500).render("500.ejs", {
    error: {
      message: errorMessage,
    },
  });
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).render("404.ejs");
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
