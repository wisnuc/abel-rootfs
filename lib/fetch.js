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

module.exports = fetch
