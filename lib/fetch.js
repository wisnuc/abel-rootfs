const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const url = require('url')

const fetch = (opts, callback) => {
  let href, protocol, req, contentType, filename, tmpfile, target
  let ws, contentLength

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
    } else {
      if (typeof opts === 'string') {
        if (!res.headers['content-type'].startsWith('application/json')) {
          err = new Error(`unexpected content type: "${res.headers['content-type']}"`)
        }
      } else {
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
      ws = fs.createWriteStream(tmpfile)
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

      if (res.headers['content-length']) {
        contentLength = parseInt(res.headers['content-length'])
      }
    }
  })
  // assuming that req error is always emitted before response
  req.on('error', err => callback(err))

  return () => {
    if (ws) {
      return {
        bytesWritten: ws.bytesWritten,
        contentLength
      }
    } else {
      return null
    }
  }
}

const node = callback => {
  let relhref = 'https://api.github.com/repos/nodejs/node/releases'
  let ver, tag, filename

  console.log('retrieving latest node.js lts releases')

  fetch(relhref, (err, body) => {
    if (err) {
      callback(err)
    } else {
      let vs = body.filter(x => !x.prerelease)
        .map(x => x.tag_name.split('.'))
        .map(xs => ({ major: parseInt(xs[0].slice(1)), minor: parseInt(xs[1]), revision: parseInt(xs[2]) }))
        .sort((a, b) => a.major - b.major ? a.major - b.major : a.minor - b.minor ? a.minor - b.minor : a.revision - b.revision)
        .reverse()

      let v = vs.find(v => v.major === 10) // LTS version
      tag = `v${v.major}.${v.minor}.${v.revision}`
      ver = tag
      filename = `node-${tag}-linux-arm64.tar.xz`
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
              console.log(`${filename} downloaded`)
              callback(null, { ver, tag, filename })
            }
          })
        } else if (err) {
          callback(err)
        } else {
          console.log(`${filename} exists, skip download`)
          callback(null, { ver, tag, filename })
        }
      })
    }
  })
}

const ubuntu = callback => {
  let ver = '18.04.1'
  let tag = ver
  let filename = `ubuntu-base-${ver}-base-arm64.tar.gz`
  let href = `http://cdimage.ubuntu.com/ubuntu-base/releases/${ver}/release/${filename}`

  fs.stat(path.join('assets', filename), (err, stats) => {
    if (err && err.code === 'ENOENT') {
      console.log(`downloading ${filename}`)
      let contentType = 'application/x-gzip'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)
      let progress = fetch({ href, contentType, filename, tmpfile, target }, err => {
        clearInterval(timer)
        if (err) {
          console.log(`download failed, ${err.message}`)
          callback(err)
        } else {
          console.log(`download finished`)
          callback(null, { ver, tag, filename })
        }
      })

      let timer = setInterval(() => {
        let p = progress()
        if (p) {
          let per
          if (p.contentLength) {
            per = new Intl.NumberFormat('en-US', {
              style: 'decimal',
              minimumIntegerDigits: 2,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(p.bytesWritten * 100 / p.contentLength)

            console.log(`${p.bytesWritten}, ${per}%`)
          } else {
            console.log(`${p.bytesWritten}`)
          }
        }
      }, 1000)
    } else if (err) {
      callback(err)
    } else {
      console.log(`${filename} exists, skip download`)
      callback(null, { ver, tag, filename })
    }
  })
}

const kernel = callback => {
  let relhref = 'https://api.github.com/repos/wisnuc/abel-mainline-kernel/releases'
  let ver, tag, filename

  console.log('retrieving latest (mainline) kernel package')

  fetch(relhref, (err, releases) => {
    if (err) {
      callback(err)
    } else {
      let latest = releases[0]
      tag = latest.tag_name
      ver = tag.split('-')[0]
      filename = `linux-image-${tag}-arm64.deb`
      let image = latest.assets.find(x => x.name === filename)
      if (!image) return callback(new Error('kernel package not found'))

      let href = image.url
      let contentType = 'application/octet-stream'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)
      fs.stat(target, err => {
        if (err && err.code === 'ENOENT') {
          fetch({ href, filename, contentType, tmpfile, target }, err => {
            if (err) {
              console.log(`download failed, ${err.message}`)
              callback(err)
            } else {
              callback(null, { ver, tag, filename })
            }
          })
        } else if (err) {
          callback(err)
        } else {
          console.log(`${filename} exists, skip download`)
          callback(null, { ver, tag, filename })
        }
      })
    }
  })
}

const ffmpegs = callback => {
  let ver
  let tag 
  let filename = 'ffmpeg-git-arm64-static.tar.xz'
  let href = 'https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-arm64-static.tar.xz'
  let md5href = `${href}.md5`

  fs.stat(path.join('assets', filename), (err, stats) => {
    if (err && err.code === 'ENOENT') {
      console.log(`downloading ${filename}`) 
      let contentType = 'application/x-xz'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)
      fetch({ href, contentType, filename, tmpfile, target }, err => {
        if (err) {
          console.log(`download failed, ${err.message}`)
          callback(err)
        } else {
          console.log(`download finished`)
          callback(null, { ver, tag, filename })
        }
      })
    } else if (err) {
      callback(err)
    } else {
      console.log(`${filename} exists, skip download`)
      callback(null, { ver, tag, filename })
    }
  })
}

module.exports = { ubuntu, node, kernel, ffmpegs }
