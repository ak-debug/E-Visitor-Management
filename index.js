const config = require("./config.json");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const session = require("express-session");
const flash = require("express-flash");


const app = express();
const PORT = process.env.PORT || 8000;

// Set EJS as view engine
app.set("views", path.join(__dirname, "views"));                       // set views file
app.set("view engine", "ejs");                                        //  set view engine
app.use("/assets", express.static(__dirname + "/public"));  
app.use(flash());


// Create Connection
const conn = mysql.createConnection({
  host: config.database.host_name,
  user: config.database.username,
  password: config.database.password,
  database: config.database.database_name,
  port: config.database.port,
});

// Setting Credentials for Twilio API
const accountSid = config.twilio.accountSid;
const authToken = config.twilio.authToken;
const client = require("twilio")(accountSid, authToken);

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  host: config.email_setting.host,
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: config.email_setting.email,
    pass: config.email_setting.password,
  },
});

// Connecting to Mysql Database
conn.connect((err) => {
  if (err) throw err;
  console.log("Mysql Connected...");
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Session configuration
app.use(
  session({
    secret: "your-secret-key",
    resave: true,
    saveUninitialized: true,
  })
);

// Middleware to check if the user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.visiteeId) {
    return next();
  } else {
    res.redirect("/visitee/login");
  }
};

// Homepage
app.get("/", (req, res) => {
  let sql = "SELECT * FROM visitors";
  let query = conn.query(sql, (err, results) => {
    if (err) throw err;
    
    let sqlVisitees = "SELECT * FROM visitees";
    conn.query(sqlVisitees, (err, visitees) => {
      if (err) throw err;
      
      res.render("visitor_view", { results: results, visitees: visitees });
    });
  });
});


// Inserting User Details in Database (VISITOR SECTION)
app.post("/save", (req, res) => {
  let data = {
    name: req.body.name,
    email_id: req.body.email_id,
    checkin: req.body.checkin,
    mobile_no: req.body.mobile_no,
    visitee_id: req.body.visitee_id, // visitee_id column for the person visitor wants to visit
  };

  let sql = "INSERT INTO visitors SET ?";

  let query = conn.query(sql, data, (err, results) => {
    if (err) throw err;
    
    let sql1 = "SELECT * FROM visitors WHERE id=" + results.insertId;
    let query1 = conn.query(sql1, (err, result) => {
      if (err) throw err;
      console.log(result);

      let htmlBody = "New visitor information:<br>";
      htmlBody += "Name: " + result[0].name + "<br><br>";
      htmlBody +=
        "Email: " +
        result[0].email_id +
        "<br><br>" +
        "Mobile Number: " +
        result[0].mobile_no +
        "<br><br>" +
        "Check In Date Time: " +
        result[0].checkin;
      
      let sqlVisitee = "SELECT email FROM visitees WHERE id = ?"; //to get email of visitee to send him mail
      let queryVisitee = conn.query(sqlVisitee, [data.visitee_id], (err, visitee) => {
        if (err) throw err;

        var mailOptions = {
          from: config.host.email, //from the configured email 
          to: visitee[0].email,    //to the visitee the visitor is visiting 
          subject: "A New Visitor Has Arrived",
          html: htmlBody,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            let MobileBody = "New visitor information: ";
            MobileBody +=
              "Name: " +
              data.name +
              " " +
              "Email: " +
              data.email_id +
              " " +
              "Mobile Number: " +
              data.mobile_no +
              " " +
              "Check In Date Time: " +
              data.checkin;
            let mobile="+91"+ data.mobile_no; //visitor's phone number for twilio message 
            client.messages.create(
              {
                body: MobileBody,
                from: config.twilio.from_number, //from twilios number
                to: mobile,   // send message to visitor's number
              },
              function (error, info) {
                if (error) {
                  console.log(error);
                } else {
                  console.log("Message sent: " + info);
                }
              }
            );

            console.log("Email sent: " + info.response);
          }
        });
      });
    });
    res.redirect("/");
  });
});


// Updating Checkout Time
app.post("/update", (req, res) => {
  let sql = "UPDATE visitors SET checkout='" + req.body.checkout + "' WHERE id=" + req.body.id;
  let query = conn.query(sql, (err, results) => {
    if (err) throw err;

    let sql1 = "SELECT * FROM visitors WHERE id=" + req.body.id;
    let query = conn.query(sql1, (err, result) => {
      if (err) throw err;

      let data = result[0];

      let sqlHost = "SELECT name FROM visitees WHERE id = ?";
      let queryHost = conn.query(sqlHost, [data.visitee_id], (err, host) => {
        if (err) throw err;

        let htmlBody = `Visitor Information
        <br> Name: ${data.name}
        <br> Email: ${data.email_id}
        <br> Mobile Number: ${data.mobile_no}
        <br> Check In Date Time: ${data.checkin}
        <br> Checked Out Datetime: ${data.checkout}
        <br> Host Name: ${host[0].name}  <!--name of visitee--!>
        <br> Host Address: ${config.host.address};  <!--visitee's address havent included this in dabase yet--!>
      `;

        var mailOptions = {
          from: config.email_setting.email,
          to: data.email_id,
          subject: "Your Recent Visit Information",
          html: htmlBody,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            console.log("Email sent: " + info.response);
          }
        });
      });
    });
    res.redirect("/");
  });
});


// Deleting any User Record
app.post("/delete", (req, res) => {
  let sql = "DELETE FROM visitors WHERE id=" + req.body.product_id + "";
  let query = conn.query(sql, (err, results) => {
    if (err) throw err;
    res.redirect("/");
  });
});

//change the visitee the visitor wants to visit
app.post("/updateVisitee", (req, res) => {
  let visitorId = req.body.visitorId;
  let visiteeId = req.body.visiteeId;

  let sql = "UPDATE visitors SET visitee_id = ? WHERE id = ?";
  let query = conn.query(sql, [visiteeId, visitorId], (err, result) => {
    if (err) throw err;
    res.send("Update successful");
  });
});



// Admin View
app.get("/admin", (req, res) => {
  let sql = "SELECT * FROM visitees";
  let query = conn.query(sql, (err, visitees) => {
    if (err) throw err;
    res.render("admin_view", { visitees: visitees });
  });
});

// Add Visitee
app.post("/admin/addVisitee", (req, res) => {
  let visitee = {
    name: req.body.name,
    email: req.body.email,
    login_id: req.body.login_id,
    password: req.body.password,
  };

  let sql = "INSERT INTO visitees SET ?";
  let query = conn.query(sql, visitee, (err, result) => {
    if (err) throw err;
    req.flash("success_msg", "Visitee added successfully");
    res.redirect("/admin");
  });
});


// Delete Visitee
app.post("/admin/deleteVisitee", (req, res) => {
  let visiteeId = req.body.visiteeId;

  let sql = "DELETE FROM visitees WHERE id = ?";
  let query = conn.query(sql, [visiteeId], (err, result) => {
    if (err) throw err;
    req.flash("success_msg", "Visitee deleted successfully");
    res.redirect("/admin");
  });
});


// Visitee View - Login Page
app.get("/visitee/login", (req, res) => {
  res.render("visitee_login");
});


// Visitee View - Authenticate and Redirect to Dashboard
app.post("/visitee/authenticate", (req, res) => {
  let loginId = req.body.login_id;
  let password = req.body.password;

  let sql = "SELECT * FROM visitees WHERE login_id = ? AND password = ?";
  let query = conn.query(sql, [loginId, password], (err, result) => {
    if (err) throw err;
    if (result.length > 0) {
      req.session.visiteeId = result[0].id; // Store visiteeId in session
      res.redirect("/visitee/dashboard");
    } else {
      res.redirect("/visitee/login");
    }
  });
});
 
// Visitee View - Dashboard
app.get("/visitee/dashboard", isAuthenticated, (req, res) => {
  let visiteeId = req.session.visiteeId;

  let sql = "SELECT * FROM visitors WHERE visitee_id = ?";
  let query = conn.query(sql, [visiteeId], (err, visitors) => {
    if (err) throw err;
    res.render("visitee_view", { visitors: visitors });
  });
});

// Visitee View - Schedule Meeting
app.post("/visitee/scheduleMeeting", isAuthenticated, (req, res) => {
  let visiteeId = req.session.visiteeId;
  let visitorId = req.body.visitorId;
  let meetingTime = new Date(req.body.meetingTime);

  let sql = "UPDATE visitors SET meeting_time = ? WHERE id = ? AND visitee_id = ?";
  let query = conn.query(sql, [meetingTime, visitorId, visiteeId], (err, result) => {
    if (err) throw err;
    res.redirect("/visitee/dashboard");
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/visitee/login");
});

// Server listening
app.listen(PORT, () => {
  console.log("Server is running at port 8000");
});
