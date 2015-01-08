
var after = require('after')
var Router = require('..')
var utils = require('./support/utils')

var assert = utils.assert
var createServer = utils.createServer
var request = utils.request

describe('Router', function () {
  describe('.param(name, fn)', function () {
    it('should reject missing name', function () {
      var router = new Router()
      assert.throws(router.param.bind(router), /argument name is required/)
    })

    it('should reject bad name', function () {
      var router = new Router()
      assert.throws(router.param.bind(router, 42), /argument name must be a string/)
    })

    it('should reject missing fn', function () {
      var router = new Router()
      assert.throws(router.param.bind(router, 'id'), /argument fn is required/)
    })

    it('should reject bad fn', function () {
      var router = new Router()
      assert.throws(router.param.bind(router, 'id', 42), /argument fn must be a function/)
    })

    it('should map logic for a path param', function (done) {
      var cb = after(2, done)
      var router = new Router()
      var server = createServer(router)

      router.param('id', function parseId(req, res, next, val) {
        req.params.id = Number(val)
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/2')
      .expect(200, 'get user 2', cb)

      request(server)
      .get('/user/bob')
      .expect(200, 'get user NaN', cb)
    })

    it('should ignore leading colon on name', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param(':id', function parseId(req, res, next, val) {
        req.params.id = Number(val)
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/bob')
      .expect(200, 'get user NaN', done)
    })

    it('should allow chaining', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('id', function parseId(req, res, next, val) {
        req.params.id = Number(val)
        next()
      })

      router.param('id', function parseId(req, res, next, val) {
        req.itemId = Number(val)
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id + ' (' + req.itemId + ')')
      })

      request(server)
      .get('/user/2')
      .expect(200, 'get user 2 (2)', done)
    })

    it('should automatically decode path value', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        req.user = user
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/%22bob%2Frobert%22')
      .expect('get user "bob/robert"', done)
    })

    it('should 400 on invalid path value', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        req.user = user
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/%bob')
      .expect(400, done)
    })

    it('should only invoke fn when necessary', function (done) {
      var cb = after(2, done)
      var router = new Router()
      var server = createServer(router)

      router.param('id', function parseId(req, res, next, val) {
        res.setHeader('x-id', val)
        next()
      })

      router.param('user', function parseUser(req, res, next, user) {
        throw new Error('boom')
      })

      router.get('/user/:user', saw)
      router.put('/user/:id', saw)

      request(server)
      .get('/user/bob')
      .expect(500, /Error: boom/, cb)

      request(server)
      .put('/user/bob')
      .expect('x-id', 'bob')
      .expect(200, 'saw PUT /user/bob', cb)
    })

    it('should only invoke fn once per request', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        req.count = (req.count || 0) + 1
        req.user = user
        next()
      })

      router.get('/user/:user', sethit(1))
      router.get('/user/:user', sethit(2))

      router.use(function (req, res) {
        res.end('get user ' + req.user + ' ' + req.count + ' times')
      })

      request(server)
      .get('/user/bob')
      .expect('get user bob 1 times', done)
    })

    it('should keep changes to req.params value', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('id', function parseUser(req, res, next, val) {
        req.count = (req.count || 0) + 1
        req.params.id = Number(val)
        next()
      })

      router.get('/user/:id', function (req, res, next) {
        res.setHeader('x-user-id', req.params.id)
        next()
      })

      router.get('/user/:id', function (req, res) {
        res.end('get user ' + req.params.id + ' ' + req.count + ' times')
      })

      request(server)
      .get('/user/01')
      .expect('get user 1 1 times', done)
    })

    it('should invoke fn if path value differs', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        req.count = (req.count || 0) + 1
        req.user = user
        req.vals = (req.vals || []).concat(user)
        next()
      })

      router.get('/:user/bob', sethit(1))
      router.get('/user/:user', sethit(2))

      router.use(function (req, res) {
        res.end('get user ' + req.user + ' ' + req.count + ' times: ' + req.vals.join(', '))
      })

      request(server)
      .get('/user/bob')
      .expect('get user bob 2 times: user, bob', done)
    })

    it('should catch exception in fn', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        throw new Error('boom')
      })

      router.get('/user/:user', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/bob')
      .expect(500, /Error: boom/, done)
    })

    it('should catch exception in chained fn', function (done) {
      var router = new Router()
      var server = createServer(router)

      router.param('user', function parseUser(req, res, next, user) {
        process.nextTick(next)
      })

      router.param('user', function parseUser(req, res, next, user) {
        throw new Error('boom')
      })

      router.get('/user/:user', function (req, res) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('get user ' + req.params.id)
      })

      request(server)
      .get('/user/bob')
      .expect(500, /Error: boom/, done)
    })
  })
})

function createServer(router) {
  return http.createServer(function onRequest(req, res) {
    router(req, res, finalhandler(req, res))
  })
}

function sethit(num) {
  var name = 'x-fn-' + String(num)
  return function hit(req, res, next) {
    res.setHeader(name, 'hit')
    next()
  }
}

function saw(req, res) {
  var msg = 'saw ' + req.method + ' ' + req.url
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}