/*
* WebTask Tracker - a torrent tracker on serverless architecture
* Copyright 2017 Pakkapon Phongthawee
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
const __VERSION = 1.00;
const __INTERVAL = 1800; // How often should clients pull server for new clients? (Seconds)
const __INTERVAL_MIN = 300; // minimum interval a client may pull the server? (Seconds) Some clients does not obey this
const __CLIENT_TIMEOUT = 60; //How long should we wait for a client to re-announce after the last announce expires? (Seconds)
const __NO_PEER_ID = true; //Should seeders not see each others? ( Hint: Should be set to true)
const __ENABLE_SHORT_ANNOUNCE = true; //Should we enable short announces? This allows NATed clients to get updates much faster, but it also takes more load on the server. 
const __REDIR_BROWSER = ''; //In case someone tries to access the tracker using a browser, redirect to this URL or file
const __CREDIT_HEADER = 'WebTask Tracker v'+__VERSION; //Feel Free to change credit header

module.exports = function (context, req, res) {
  if(Object.keys(req.query).length === 0 && req.query.constructor === Object){
    if(__REDIR_BROWSER !== ""){
      res.writeHead(302, { 'Location': __REDIR_BROWSER });
      res.end();
    }else{
      res.writeHead(403, { 'Content-Type': 'text/html ' });
      res.end('You are not allow to access this site.');
    }
    return;
  }
  //set header
  res.writeHead(200, { 'Content-Type': 'Text/Plain','X-Tracker-Version': __CREDIT_HEADER});
  //function implementation
  var validate = function(param,must_be_20_chars){
    var length = unescape(req.query[param]).length;
    if(!req.query[param]){
      throw 'Missing one or more arguments';
    }
    if (must_be_20_chars && length != 20) {
      throw 'Invalid length on '+param+' argument';
    }
    if (length > 128) { //128 chars should really be enough
        throw 'Argument '+param+' is too large to handle';
    }
  }
  var readDatabase = function(callback){
    context.storage.get(function(err,data){
      if (err){
        throw 'Unable to read database';
      }
      if(data === undefined){
        data = {};
      }
      callback(data);
    });
  }
  var writeDatabase = function(db){
    var attempts = 3;
    context.storage.set(db, function set_cb(err) {
      if (err) {
        // resolve conflict and re-attempt set
        if (error.code === 409 && attempts--) {
          return context.storage.set(data, saveDatabase);
        }
        throw 'Unable to write database';
      }
    });
  }
  // return peers list string
  var getPeer = function(db){
    var peers = '';
    var complete = 0;
    var incomplete = 0; 
    Object.keys(db).forEach(function(id) {
      if(db[id].is_seed){
        complete++;
        if(__NO_SEED_P2P && req.query.left === 0){ //Seeds should not see each others
          return;
        }
      }else{
        incomplete++;
      }
      var peer = '';
      db[id].peer_id = unescape(db[id].peer_id);
      if(req.query.no_peer_id === undefined && __NO_PEER_ID){
        peer = '7:peer id'+db[id].peer_id.length+':'+db[id].peer_id;
      }
      peers += 'd2:ip'+db[id].ip.length+':'+db[id].ip+peer+'4:porti'+db[id].port+'ee';
    });
    return 'd8:intervali'+interval+'e12:min intervali'+interval_min+'e8:completei'+complete+'e10:incompletei'+incomplete+'e5:peersl'+peers+'ee';
  }
  //Main Application
  var interval = __INTERVAL;
  var interval_min = __INTERVAL_MIN;
  if (req.query.short && __ENABLE_SHORT_ANNOUNCE) {
    interval = 120;
    interval_min = 30;
  }
  try{
    validate('peer_id',true);
    validate('port');
    validate('info_hash',true);
    if(req.query.port < 1 && req.query.port > 65535){
      throw 'Invalid client port';
    }
    readDatabase(function (db) {
      var uid = req.query.peer_id+req.query.info_hash;
      var current_time = Math.round(new Date().getTime()/1000);
      //add this peer to database
      db[uid] = {
        ip:  req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
        peer_id: req.query.peer_id,
        port: req.query.port,
        expire: current_time + interval,
        is_seed: req.query.left === 0
      };
      if (req.query.event === 'stopped') {
        delete db[uid];
        writeDatabase(db);
        return res.end();
      }
      //remove expired peer
      Object.keys(db).forEach(function(id) {
        if(db[id].expire < current_time){
          delete db[id];
        }
      });
      writeDatabase(db);
      //filter only match info_hash to return
      Object.keys(db).forEach(function(id) {
        if(db[id].info_hash == req.query.info_hash){
          delete db[id];
        }
      });
      delete db[uid]; //remove self from peers list
      res.end(getPeer(db));
    });
  }catch(e){
    var msg = e.toString();
    return res.end('d14:failure reason'+msg.length+':'+msg+'e');
  }
};
