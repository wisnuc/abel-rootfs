const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = require('child_process')
const http = require('http')
const https = require('https')
const url = require('url')

const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const rimrafAsync = Promise.promisify(rimraf)
const mkdirpAsync = Promise.promisify(mkdirp)

let ubuntuVer = '18.04.1'
let ubuntuFileName = `ubuntu-base-${ubuntuVer}-base-arm64.tar.gz`
let ubuntuTar = path.join('assets', ubuntuFileName)

let nodeTar
let nodeVer

let kernelVer
let kernelDeb

if (process.getuid()) {
  console.log('this script requires root priviledge')
  process.exit()
}

let args = process.argv.slice(2)
args.forEach(arg => {})

const fetch = (opts, callback) => {
  let href, protocol, req, contentType, filename, tmpfile, target

  if (typeof opts === 'string') {
    href = opts
    contentType = 'application/json'
  } else {
    href = opts.href
    contentType = opts.contentType
    filename = opts.filename
    tmpfile = opts.tmpfile
    target = opts.target
  }

  if (href.startsWith('http://')) {
    protocol = http
  } else if (href.startsWith('https://')) {
    protocol = https
  } else {
    let err = new Error('invalid href protocol')
    return process.nextTick(() => callback(err))
  }

  let httpOpts = {
    headers: {
      'User-Agent': 'winas/1.0.0',
      'Accept': contentType
    }
  }
  req = protocol.get(href, httpOpts, res => {
    let err

    if (res.statusCode === 302) { // redirection
      let location = res.headers.location
      let x = new url.URL(location)
      console.log(`redirect to ${x.origin + x.pathname}`)
      return fetch({ href: location, contentType, filename, tmpfile, target }, callback)
    } else if (res.statusCode !== 200) {
      err = new Error(`request failed with status code ${res.statusCode}`)
      // console.log(href)
    } else {
      if (typeof opts === 'string') {
        if (!res.headers['content-type'].startsWith('application/json')) {
          err = new Error(`unexpected content type: "${res.headers['content-type']}"`)
        }
      } else {
        /**
        if (contentType !=='application/x-gzip' &&
          contentType !== 'application/x-xz') {
*/
        if (res.headers['content-type'] !== contentType) {
          err = new Error(`unexpected content type: "${res.headers['content-type']}"`)
        }
      }
    }

    if (err) {
      // should we resume or destroy ???
      res.resume()
      return callback(err)
    }

    if (typeof opts === 'string') {
      res.setEncoding('utf8')
      let json = ''
      res.on('data', chunk => (json += chunk))
      res.on('error', err => {
        res.removeAllListeners()
        res.on('error', () => {})
        callback(err)
      })
      res.on('end', () => {
        try {
          callback(null, JSON.parse(json))
        } catch (e) {
          callback(e)
        }
      })
    } else {
      let opened = false
      let ws = fs.createWriteStream(tmpfile)
      ws.on('open', () => (opened = true))
      ws.on('error', err => {
        ws.removeAllListeners('error')
        ws.removeAllListeners('finish')
        ws.on('error', () => {})
        res.removeAllListeners('error')
        res.on('error', () => {})
        res.unpipe()
        res.destroy()
        if (opened) {
          ws.end()
          ws.on('close', () => callback(err))
        } else {
          callback(err)
        }
      })

      res.on('error', err => {
        ws.removeAllListeners('error')
        ws.removeAllListeners('finish')
        ws.on('error', () => {})
        res.removeAllListeners('error')
        res.on('error', () => {})
        res.unpipe()
        res.destroy()
        ws.end(() => callback(err))
      })

      ws.on('finish', () => fs.rename(tmpfile, target, e => callback(e)))
      res.pipe(ws)
    }
  })
  // assuming that req error is always emitted before response
  req.on('error', err => callback(err))
}

const getNode = callback => {
  console.log('retrieving latest node.js lts releases')
  fetch('https://api.github.com/repos/nodejs/node/releases', (err, body) => {
    if (err) {
      callback(err)
    } else {
      let vs = body.filter(x => !x.prerelease)
        .map(x => x.tag_name.split('.'))
        .map(xs => ({ major: parseInt(xs[0].slice(1)), minor: parseInt(xs[1]), revision: parseInt(xs[2]) }))
        .sort((a, b) => a.major - b.major ? a.major - b.major : a.minor - b.minor ? a.minor - b.minor : a.revision - b.revision)
        .reverse()

      let v = vs.find(v => v.major === 10) // LTS version
      let tag = `v${v.major}.${v.minor}.${v.revision}`
      let filename = `node-${tag}-linux-arm64.tar.xz`
      let target = path.join('assets', filename)
      fs.stat(target, (err, stats) => {
        if (err && err.code === 'ENOENT') {
          console.log(`downloading ${filename}`)
          let href = `https://nodejs.org/dist/${tag}/${filename}`
          let contentType = 'application/x-xz'
          let tmpfile = path.join('tmp', filename)
          fetch({ href, contentType, filename, tmpfile, target }, err => {
            if (err) {
              console.log(`download failed, ${err.message}`)
              callback(err)
            } else {
              console.log(`${target} downloaded`)
              nodeVer = tag
              nodeTar = target
              callback(null)
            }
          })
        } else if (err) {
          callback(err)
        } else {
          console.log(`${target} exists, skip download`)
          nodeVer = tag
          nodeTar = target
          callback()
        }
      })
    }
  })
}

const getUbuntu = callback => fs.stat(ubuntuTar, (err, stats) => {
  if (err && err.code === 'ENOENT') {
    console.log(`downloading ${ubuntuFileName}`)
    let filename = ubuntuFileName
    let href = `http://cdimage.ubuntu.com/ubuntu-base/releases/${ubuntuVer}/release/${filename}`
    let contentType = 'application/x-gzip'
    let tmpfile = path.join('tmp', filename)
    let target = ubuntuTar
    fetch({ href, contentType, filename, tmpfile, target }, err => {
      if (err) {
        console.log(`download failed, ${err.message}`)
        callback(err)
      } else {
        console.log(`download finished`)
        callback(null)
      }
    })
  } else if (err) {
    callback(err)
  } else {
    console.log(`${ubuntuTar} exists, skip download`)
    callback()
  }
})

const getKernel = callback => {
  console.log('retrieving latest (mainline) kernel package')
  fetch('https://api.github.com/repos/wisnuc/abel-mainline-kernel/releases', (err, releases) => {
    if (err) {
      callback(err)
    } else {
      let latest = releases[0]
      let tag = latest.tag_name
      let filename = `linux-image-${tag}-arm64.deb`
      let image = latest.assets.find(x => x.name === filename)
      if (!image) return callback(new Error('kernel package not found'))

      // TODO skip download if exists

      let href = image.url
      let contentType = 'application/octet-stream'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)
      fetch({ href, filename, contentType, tmpfile, target }, err => {
        console.log(err)
        callback(err)
      })
    }
  })
}

const getUbuntuAsync = Promise.promisify(getUbuntu)
const getNodeAsync = Promise.promisify(getNode)
const getKernelAsync = Promise.promisify(getKernel)

;(async () => {
  await rimrafAsync('tmp')
  await mkdirpAsync('tmp')
  await getUbuntuAsync()
  await getNodeAsync()
  await getKernelAsync()
})().then(() => {}).catch(e => console.log(e))
