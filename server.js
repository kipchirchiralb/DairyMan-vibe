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

app.get("/animal-profiles", (req, res) => {
  const message = req.query.message;
  let successMessage = null;

  if (message === "status_updated") {
    successMessage = "Animal status updated successfully!";
  }

  dbConn.query(
    sqlQueries.getAnimalsProductionsForFarmer(req.session.farmer.farmer_id),
    (sqlErr, animals) => {
      if (sqlErr) return res.status(500).send("Server Error!" + sqlErr);
      console.log(utils.getChartData(animals));

      dbConn.query(
        `select * from animal WHERE owner_id=${req.session.farmer.farmer_id}`,
        (err, allAnimalsForFarmer) => {
          res.render("animal-profiles.ejs", {
            animals: utils.getChartData(animals),
            allAnimalsForFarmer,
            successMessage,
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
  purchase_date.length == 0
    ? (purchase_date = "2000-01-01")
    : (purchase_date = purchase_date);
  console.log(req.body);

  const insertAnimalStatement = `INSERT INTO animal(animal_tag,name,dob,purchase_date,breed,status,source,gender,owner_id) VALUES("${animal_tag}","${name}","${dob}","${purchase_date}","${breed}","${status}","${source}","${gender}", ${req.session.farmer.farmer_id})`;

  dbConn.query(insertAnimalStatement, (sqlErr) => {
    if (sqlErr) {
      console.log(sqlErr);
      return res.status(500).send("Server Error!" + sqlErr);
    }
    res.redirect("/animal-profiles");
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

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
