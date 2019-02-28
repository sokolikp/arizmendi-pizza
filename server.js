const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const http = require('http');
const server = http.Server(app);
const request = require('request');
const moment = require('moment');
const mongoose = require('mongoose');
const isProduction = process.env.NODE_ENV === 'production';

// config
app.set("port", process.env.PORT || 3000);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// connect mongodb
const dbUri =  process.env.MONGODB_URI || 'mongodb://localhost/arizmendi';
mongoose.connect(dbUri, {useNewUrlParser: true});

// set up the MongoDB schema stuff
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log("Connected to mondoDB")
});
const pizzaSchema = new mongoose.Schema({
  date: Date,
  dateStr: String,
  ingredientsRawString: String,
  ingredients: [String]
});
const ingredientStatisticSchema = new mongoose.Schema({
  ingredient: String,
  count: Number,
  percentage: Number
});
const ingredientSchema = new mongoose.Schema({
  date: Date,
  name: String
});
const Pizza = mongoose.model('Pizza', pizzaSchema);
const IngredientStatistic = mongoose.model('IngredientStatistic', ingredientStatisticSchema);
const Ingredient = mongoose.model('Ingredient', ingredientSchema);

// serve static assets in production - otherwise client server handles asset serving
if (isProduction) {
  app.use(express.static(__dirname + "/client/dist"));
}

// routes

// this is only hit/served in production
// app.get('/*', function (req, res) {
//   const serveDir = isProduction ? 'dist' : 'public';
//   const servePath = __dirname + '/client/' + serveDir + '/index.html';
//   console.log("Serving root", servePath);
//   res.sendFile(servePath);
// });

// GET is a little weird because we proxy a request to the squarespace
// Arizmendi site. Since we don't want to bombard them with requests
// every time someone requests our page, we save the pizza data
// in our own MongoDB instance so that we can use that for future requests.
// So while this is a GET for the client, we post data to our db for later use.
app.get('/api/pizza/', (req, res) => {
  const {start, end} = req.query;

  // you gotta send me the date strings!
  if (!start || !end) {
    return res.sendStatus(400);
  }

  // first, check whether it's in our db
  Pizza.find({dateStr: start}, function (err, pizzas) {
    if (err) {
      console.log("Error finding record.");
      return;
    }

    if (pizzas.length > 1) {
      console.log("Found multiple records!");
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else if (pizzas.length === 1) {
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else {
      // make a proxy request. We just grab the entire HTML page
      // and parse the result.
      const options = {
        url: 'http://arizmendi-valencia.squarespace.com/pizza/',
        headers: {
          'User-Agent': 'request' // user-agent is required by squarespace
        }
      };

      request(options, (err, response, body) => {
        if (err) {
          return res.sendStatus(500);
        }

        if (response && response.statusCode !== 200) {
          return res.sendStatus(500);
        }

        // get the target <p> node wrapper
        let startIdx = body.indexOf(start);
        let endIdx = body.indexOf(end);
        // if we can't find the start date ("today's" date),
        // the client sent us bad data.
        if (startIdx === -1) {
          return res.sendStatus(400);
        } else if (endIdx === -1 && end.split(" ")[0] === "Tuesday") {
          // if we can't find the end date string, check if 'tomorrow' is Tuesday (the end of the menu).
          // In this case, set endIdx to the end of the body string.
          endIdx = body.length;
        } else if (endIdx === -1) {
          // if we still can't find the end date, there's something wrong
          return res.sendStatus(400);
        }

        // go to the end of the start string
        startIdx += start.length
        let targetSubstr = body.substring(startIdx, endIdx);

        // now trim off <p> tags, returning 500 at each step if we
        // improperly parse the string
        startIdx = targetSubstr.indexOf('<p') + 3; // opening <p> tag plus its length
        if (startIdx === -1) {
          return res.sendStatus(500);
        }
        targetSubstr = targetSubstr.substring(startIdx).trim();

        // end <p> tag
        endIdx = targetSubstr.indexOf('</p>');
        if (endIdx === -1) {
          return res.sendStatus(500);
        }
        targetSubstr = targetSubstr.substring(0, endIdx).trim();

        // there should just be one closing tag left at the beginning now
        startIdx = targetSubstr.indexOf('>') + 1;
        if (startIdx === -1) {
          return res.sendStatus(500);
        }
        targetSubstr = targetSubstr.substring(startIdx).trim();

        // if we got here without issue, we'll save the data in our db
        const momentDate = moment(start, 'dddd MMM D, YYYY').utc();
        const pizza = new Pizza({
          date: momentDate.toDate(),
          dateStr: start,
          ingredientsRawString: targetSubstr,
          ingredients: targetSubstr.toLowerCase().split(", ")
        });
        pizza.save(function (err, pizza) {
          if (err) {
            console.log("Could not save pizza!");
            return;
          }
          console.log("Saved pizza");
        });

        targetSubstr.toLowerCase().split(", ").forEach(ingredientStr => {
          // save pizza ingredient statistic
          let ingredientStatistic;
          IngredientStatistic.find({ingredient: ingredientStr}, (err, ingredients) => {
            if (err) {
              console.log("Error finding ingredientStatistic!");
              return;
            }
            if (ingredients.length === 1) {
              ingredientStatistic = ingredients[0];
            } else {
              ingredientStatistic = new IngredientStatistic({
                ingredient: ingredientStr,
                count: 0,
                percentage: 0
              });
            }
            ingredientStatistic.count += 1;
            let totalPizzaCount = 0;
            Pizza.countDocuments()
            .then(count => {
              totalPizzaCount = count;
              if (totalPizzaCount > 0) {
                ingredientStatistic.percentage = ingredientStatistic.count / totalPizzaCount;
              }
            })
            .then(() => {
              return ingredientStatistic.save()
            })
            .then(stat => {
              console.log("Saved ingredientStatistic");
            })
            .catch(err => {
              console.log("Could not save ingredientStatistic!");
            });


            // save ingredient to daily table (always create a new record)
            const ingredient = new Ingredient({
              date: momentDate.toDate(),
              name: ingredientStr
            });
            ingredient.save(function (err, ingredient) {
              if (err) {
                console.log("Could not save ingredient!");
                return;
              }
              console.log("Saved ingredient");
            });
          });
        });

        res.json({cached: false, data: targetSubstr});
      });
    }
  });
});

server.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});
