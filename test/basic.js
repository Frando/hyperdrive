var tape = require('tape')
var sodium = require('sodium-universal')
var create = require('./helpers/create')
var stream = require('stream')

tape('write and read', function (t) {
  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
      t.end()
    })
  })
})

tape('write and read (2 parallel)', function (t) {
  t.plan(6)

  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
    })
  })

  archive.writeFile('/world.txt', 'hello', function (err) {
    t.error(err, 'no error')
    archive.readFile('/world.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('hello'))
    })
  })
})

tape('write and read (sparse)', function (t) {
  t.plan(2)

  var archive = create()
  archive.on('ready', function () {
    var clone = create(archive.key, {sparse: true})

    archive.writeFile('/hello.txt', 'world', function (err) {
      t.error(err, 'no error')
      var stream = clone.replicate()
      stream.pipe(archive.replicate()).pipe(stream)

      var readStream = clone.createReadStream('/hello.txt')
      readStream.on('data', function (data) {
        t.same(data.toString(), 'world')
      })
    })
  })
})

tape('write and unlink', function (t) {
  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.unlink('/hello.txt', function (err) {
      t.error(err, 'no error')
      archive.readFile('/hello.txt', function (err) {
        t.ok(err, 'had error')
        t.end()
      })
    })
  })
})

tape('root is always there', function (t) {
  var archive = create()

  archive.access('/', function (err) {
    t.error(err, 'no error')
    archive.readdir('/', function (err, list) {
      t.error(err, 'no error')
      t.same(list, [])
      t.end()
    })
  })
})

tape.skip('owner is writable', function (t) {
  var archive = create()

  archive.on('ready', function () {
    t.ok(archive.writable)
    t.ok(archive.metadata.writable)
    t.ok(archive.content.writable)
    t.end()
  })
})

tape.skip('provide keypair', function (t) {
  var publicKey = Buffer.from(sodium.crypto_sign_PUBLICKEYBYTES)
  var secretKey = Buffer.from(sodium.crypto_sign_SECRETKEYBYTES)

  sodium.crypto_sign_keypair(publicKey, secretKey)

  var archive = create(publicKey, {secretKey: secretKey})

  archive.on('ready', function () {
    t.ok(archive.writable)
    t.ok(archive.metadata.writable)
    t.ok(archive.content.writable)
    t.ok(publicKey.equals(archive.key))

    archive.writeFile('/hello.txt', 'world', function (err) {
      t.error(err, 'no error')
      archive.readFile('/hello.txt', function (err, buf) {
        t.error(err, 'no error')
        t.same(buf, Buffer.from('world'))
        t.end()
      })
    })
  })
})

tape.skip('download a version', function (t) {
  var src = create()
  src.on('ready', function () {
    src.writeFile('/first.txt', 'number 1', function (err) {
      t.error(err, 'no error')
      src.writeFile('/second.txt', 'number 2', function (err) {
        t.error(err, 'no error')
        src.writeFile('/third.txt', 'number 3', function (err) {
          t.error(err, 'no error')
          testDownloadVersion()
        })
      })
    })
  })

  function testDownloadVersion () {
    var clone = create(src.key, { sparse: true })
    clone.checkout(2).download(function (err) {
      t.error(err)
      clone.readFile('/second.txt', { cached: true }, function (err, content) {
        t.error(err, 'block not downloaded')
        t.same(content && content.toString(), 'number 2', 'content does not match')
        clone.readFile('/third.txt', { cached: true }, function (err, content) {
          t.same(err && err.message, 'Block not downloaded')
          t.end()
        })
      })
    })
    var stream = clone.replicate()
    stream.pipe(src.replicate()).pipe(stream)
  }
})

tape('write and read, no cache', function (t) {
  var archive = create({
    metadataStorageCacheSize: 0,
    contentStorageCacheSize: 0,
    treeCacheSize: 0
  })

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
      t.end()
    })
  })
})

tape('flush while writing', function (t) {
  const DATA = Buffer.alloc(32 * 1000).fill('0123')
  const archive = create()

  let rs
  const readbufs = []

  const source = new stream.Readable({
    read () {}
  })
  source.push(DATA)
  source.push(DATA)

  let ws = archive.createWriteStream('file', {
    size: 10 * 32 * 1000,
    flushAtStart: true,
    afterFlush: afterFlush
  })
  source.pipe(ws)

  function afterFlush (err, st, done) {
    t.error(err)
    if (!rs) startRead()
    if (done) setTimeout(() => rs.emit('end'), 200)
  }

  function startRead () {
    rs = archive.createReadStream('file')
    rs.on('end', finish)
    rs.on('data', (data) => {
      readbufs.push(data)
      if (readbufs.length === 1) {
        source.push(DATA)
        source.push(null)
      }
    })
  }

  function finish () {
    const expected = Buffer.alloc(3 * 32 * 1000).fill('0123')
    let real = Buffer.concat(readbufs)
    t.same(real, expected, 'End result matches.')
    t.end()
  }
})
