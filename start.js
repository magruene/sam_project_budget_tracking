var express = require('express')
  , cors = require('cors')
  , app = express();
var corsOptions = {
  origin: 'http://localhost:1337'
};
 
app.use(cors(corsOptions));
app.use(express.static(__dirname + '/'));
 
app.get('/test.html', function(req, res, next){
  res.json({msg: 'This is CORS-enabled for all origins!'});
});
 
app.listen(1337, function(){
  console.log('CORS-enabled web server listening on port 80');
});
