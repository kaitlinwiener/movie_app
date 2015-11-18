var express = require ('express'),
    PORT = process.env.PORT || 5432,
    server = express(),
    MONGOURI = process.env.MONGOLAB_URI || "mongodb://localhost:27017",
    dbname = "moviePicks",
    mongoose = require('mongoose'),
    morgan = require('morgan'),
    ejs = require ('ejs'),
    layouts = require ('express-ejs-layouts'),
    session = require ('express-session'),
    methodOverride = require ('method-override'),
    bodyParser = require ('body-parser'),
    Schema = mongoose.Schema,
    bcrypt = require('bcryptjs'),
    SALT_WORK_FACTOR = 10;

// MONGOOSE STUFF

var userSchema = new Schema({
  username:  { type: String, required: true, unique: true},
  password: {type: String, required: true},
  movies: [{type: Schema.Types.Mixed, ref: 'Movie'}]
}, {collections: 'users', strict: false});

var User = mongoose.model('user', userSchema);

var movieSchema = new Schema({
  title:  { type: String, required: true},
  genre: [{type: String, required: true}]
}, {collections: 'movies', strict: false});

var Movie = mongoose.model('movie', movieSchema);

mongoose.connect(MONGOURI + "/" + dbname);
server.listen(PORT, function () {
  console.log("Server is up on port:", PORT);
})


userSchema.pre('save', function(next) {
  var user = this;

  if (!user.isModified('password')) return next();

  bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
    if (err) return next(err);

    bcrypt.hash(user.password, salt, function(err, hash) {
      if (err) return next(err);

      user.password = hash;
      next();
    });
  });
});

userSchema.methods.comparePassword = function(candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
    if (err) return cb(err);
    cb(null, isMatch);
  });
};

//APP STUFF

server.set('views', './views');
server.set('view engine', 'ejs');

server.use(morgan('dev'));
server.use(bodyParser.urlencoded({
  extended: true
}));

server.use(session({
  secret: "someFancySecret",
  resave: false,
  saveUninitialized: true
}));

server.use(layouts);

server.use(function (req, res, next) {
  res.locals.flash  = req.session.flash || {};
  req.session.flash = {};
  next();
});

server.use(function (req, res, next) {
  res.locals.currentUser = req.session.currentUser;
  next();
});

server.use(methodOverride('_method'));

server.use(express.static('./public'));



//ROUTES

server.get('/', function (req, res) {
  res.render('home')
  console.log(req.session.currentUser)
})

server.get('/login', function (req, res) {
  res.render('login');
})


//SIGN UP
server.post('/users/new', function (req, res) {
  //make sure username and password are filled out
  if (!req.body.user.password) {
    req.session.flash.needPassword = "Please enter a password";
    res.redirect(302, '/login');
  } else if (!req.body.user.username) {
    req.session.flash.needUser = "Please enter a valid username";
    res.redirect(302, '/login');
  }
  else {
    var name = req.body.user.username.toLowerCase();
    var password = req.body.user.password;
    var user = {};
    user.username = name;
    user.password = password;
    var newUser = new User(user);
    req.session.currentUser = user;

    newUser.save(function (err, added) {
      if (err) {
        if (err.code === 11000) {
          req.session.flash.duplicateName = "Username already in use";
          res.redirect(302, '/login');
        } else {
          console.log(err);
        }
      } else {
        User.find({}, function (err, users) {
          if (err) {
            console.log(err)
          } else {
            req.session.numUsers = users.length
            res.redirect(302, '/')
          }
        } )
      }
    });
  }
});

//LOG IN
server.post('/session', function (req, res) {
  req.body.user.username = req.body.user.username.toLowerCase();
  User.findOne({username: req.body.user.username}, function (err, currentUser) {
    if (err) {
      console.log(err);
    } else {
        if (currentUser === null) {
          req.session.flash.userDoesntExist = "Incorrect Username";
          res.redirect(302, '/login')
        }  else {
            bcrypt.compare(req.body.user.password, currentUser.password, function (err, match) {
            if (err) {
              console.log(err);
            } else if (!match) {
              req.session.flash.incorrectPassword = "Incorrect Password";
              res.redirect(302, '/login')
            } else {
              req.session.currentUser = req.body.user;
              User.find({}, function (err, users) {
                if (err) {
                  console.log("err")
                } else {
                  req.session.numUsers = users.length
                  res.redirect(302, '/')
                }
              } )
            }
        })
        }
    }
  });
});
