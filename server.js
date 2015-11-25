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
SALT_WORK_FACTOR = 10,
APIClinet = require('omdb-api-client'),
omdb = new APIClinet();

// MONGOOSE STUFF

var userSchema = new Schema({
  username:  { type: String, required: true, unique: true},
  password: {type: String, required: true},
  movies: [{type: Schema.Types.Mixed, ref: 'Movie'}]
}, {collections: 'users', strict: false});

var User = mongoose.model('user', userSchema);

var movieSchema = new Schema({
  title:  { type: String, required: true},
  genre: [{type: String, required: true}],
  plot: {type: String, required: true},
  posterUrl: {type: String},
  watched: {type: Boolean, required: true, default: false}
}, {collections: 'movies', strict: false});

var Movie = mongoose.model('movie', movieSchema);

mongoose.connect(MONGOURI + "/" + dbname);
server.listen(PORT, function () {
  console.log("Server is up on port:", PORT);
})

//hash password before user is saved
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

//compare password when user logs in
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
  //if user is logged in, set the current user and render the homepage

  if (req.session.currentUser) {
    User.findOne({username: req.session.currentUser.username}, function (err, currentUser) {
      if (err) {
        console.log(err);
      } else {
        res.render('home', {
          movies: currentUser.movies
        });
      }
    })
    //otherwise redirect to the login page
  } else {
    res.redirect(302, '/login')
  }
});

//initially search for a movie
server.post('/movies/search/:number', function (req, res) {
  var searchTitle = req.body.search
  omdb({s: searchTitle}).list().then(function(movieResults) {
    var movieId = movieResults.search[0].imdbID
    omdb({i:movieId}).list(function(err, specificMovie) {
      res.render('show', {
        results: movieResults,
        movie: specificMovie,
        number: req.params.number,
        searchTitle: searchTitle
      })
    });
  }).catch(function(err) {
    console.log(err);
    req.session.flash.noMovie = "Nothing Found! Try Again";
    res.redirect(302, '/movies/new');
  });
})

//get next movie in search result array
server.get('/movies/search/:title/:number', function (req, res) {
  number = Number(req.params.number)
  searchTitle = req.params.title
  omdb({s: searchTitle}).list().then(function(movieResults) {
    var movieId = movieResults.search[number].imdbID
    omdb({i:movieId}).list(function(err, specificMovie) {
      console.log(specificMovie)
      res.render('show', {
        results: movieResults,
        movie: specificMovie
      })
    });
  }).catch(function(err) {
    console.log(err);
  });
})

//if already logged in, redirect to main page
server.get('/login', function (req, res) {
  // if (req.session.currentUser) {
  //   res.redirect(302, '/')
  // } else {
    res.render('login');
  // }
})


//sign up
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

//log in
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

server.get('/movies/new', function (req, res) {
  res.render('new')
})

//add a new movie to the list
server.post('/movies', function (req, res) {
  var currentUser = req.session.currentUser

  var newMovie = new Movie (req.body.movie)
  newMovie.save(function (err, addedMovie) {
    if (err) {
      console.log(err)
    } else {
      User.findOne({username: currentUser.username}, function (err, currentUser) {
        currentUser.movies.push(newMovie);
        currentUser.save(function (err, pushed) {
          if (err) {
            console.log(err)
          } else {
            res.redirect(302, '/')
          }
        })
      })
    }
  })
})

//pick a movie at random from library
server.get('/pick', function (req, res) {
  User.findOne({username: req.session.currentUser.username}, function (err, currentUser) {
    if (err) {
      console.log(err)
    } else {
      var unwatchedMovies = []
      currentUser.movies.forEach (function (movie, i) {
        if (movie.watched == false) {
          unwatchedMovies.push(movie)
        }
      })
      var number = Math.floor(Math.random()*unwatchedMovies.length)
      var pick = unwatchedMovies[number]
      res.render('pick', {
        movie: pick
      })
    }
  })
})

//checked movie as watched
server.post('/movies/:id', function (req, res) {
  User.findOne({username: req.session.currentUser.username}, function (err, currentUser) {
    if (err) {
      console.log(err)
    } else {
      currentUser.movies.forEach(function (movie, i) {
        if (movie._id == req.params.id) {
          currentUser.movies[i].watched = true;
          User.update(currentUser, function (err, savedUser) {
            if (err) {
              console.log("errrrrror")
              console.log(err)
            } else {
              res.redirect(302, '/')
            }
          })
        }
      })
    }
  })
})

//signout
server.delete('/session', function (req, res) {
  req.session.currentUser = null;
  res.redirect(302, '/login');
})
