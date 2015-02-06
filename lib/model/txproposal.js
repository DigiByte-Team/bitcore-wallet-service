'use strict';

var _ = require('lodash');
var Guid = require('guid');
var Bitcore = require('bitcore');

var TxProposalAction = require('./txproposalaction');

var VERSION = '1.0.0';

function TxProposal(opts) {
  opts = opts || {};

  this.version = VERSION;
  this.createdOn = Math.floor(Date.now() / 1000);
  this.id = Guid.raw();
  this.creatorId = opts.creatorId;
  this.toAddress = opts.toAddress;
  this.amount = opts.amount;
  this.message = opts.message;
  this.changeAddress = opts.changeAddress;
  this.inputs = opts.inputs;
  this.inputPaths = opts.inputPaths;
  this.requiredSignatures = opts.requiredSignatures;
  this.maxRejections = opts.maxRejections;
  this.status = 'pending';
  this.actions = {};
};

TxProposal.fromObj = function(obj) {
  var x = new TxProposal();

  x.version = obj.version;
  x.createdOn = obj.createdOn;
  x.id = obj.id;
  x.creatorId = obj.creatorId;
  x.toAddress = obj.toAddress;
  x.amount = obj.amount;
  x.message = obj.message;
  x.changeAddress = obj.changeAddress;
  x.inputs = obj.inputs;
  x.requiredSignatures = obj.requiredSignatures;
  x.maxRejections = obj.maxRejections;
  x.status = obj.status;
  x.txid = obj.txid;
  x.inputPaths = obj.inputPaths;
  x.actions = obj.actions;
  _.each(x.actions, function(action, copayerId) {
    x.actions[copayerId] = new TxProposalAction(action);
  });

  return x;
};


TxProposal.prototype._updateStatus = function() {
  if (this.status != 'pending') return;

  if (this.isRejected()) {
    this.status = 'rejected';
  } else if (this.isAccepted()) {
    this.status = 'accepted';
  }
};


TxProposal.prototype._getBitcoreTx = function(n) {
  var self = this;

  var t = new Bitcore.Transaction();
  _.each(this.inputs, function(i) {
    t.from(i, i.publicKeys, self.requiredSignatures)
  });

  t.to(this.toAddress, this.amount)
    .change(this.changeAddress);

  t._updateChangeOutput();
  return t;
};


TxProposal.prototype.addAction = function(copayerId, type, signatures) {
  var action = new TxProposalAction({
    copayerId: copayerId,
    type: type,
    signatures: signatures,
  });
  this.actions[copayerId] = action;
  this._updateStatus();
};

// TODO: no sure we should receive xpub or a list of pubkeys (pre derived)
TxProposal.prototype.checkSignatures = function(signatures, xpub) {
  var self = this;

  var t = this._getBitcoreTx();

  if (signatures.length != this.inputs.length)
    return false;

  var oks = 0,
    i = 0,
    x = new Bitcore.HDPublicKey(xpub);

  _.each(signatures, function(signatureHex) {
    var input = self.inputs[i];
    try {
      var signature = Bitcore.crypto.Signature.fromString(signatureHex);
      var pub = x.derive(self.inputPaths[i]).publicKey;
      var s = {
        inputIndex: i,
        signature: signature,
        sigtype: Bitcore.crypto.Signature.SIGHASH_ALL,
        publicKey: pub,
      };
      i++;

      t.applySignature(s);
      oks++;
    } catch (e) {
      // TODO only for debug now
      console.log('DEBUG ONLY:',e.message); //TODO
    };
  });
  return oks === t.inputs.length;
};


TxProposal.prototype.sign = function(copayerId, signatures) {
  this.addAction(copayerId, 'accept', signatures);
};

TxProposal.prototype.reject = function(copayerId) {
  this.addAction(copayerId, 'reject');
};

TxProposal.prototype.isAccepted = function() {
  var votes = _.countBy(_.values(this.actions), 'type');
  return votes['accept'] >= this.requiredSignatures;
};

TxProposal.prototype.isRejected = function() {
  var votes = _.countBy(_.values(this.actions), 'type');
  return votes['reject'] > this.maxRejections;
};

TxProposal.prototype.setBroadcasted = function(txid) {
  this.txid = txid;
  this.status = 'broadcasted';
};

module.exports = TxProposal;