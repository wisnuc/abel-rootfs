const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')
const http = require('http')
const https = require('https')

class Fetch extends EventEmitter {
  constructor (opts) {
    // check url
    this.url = opts.url
    if (this.url.startsWith('https://')) {
      this.req = https   
    } else if (this.url.startsWith('http://')) {
      this.req = http
    } else {
      return process.nextTick(() => this.emit(new Error('invalid url')))
    }

    if (opts.name) {
      this.name = opts.name
      this.regex = /^application\/octet-stream/
      this.tmpDir = opts.tmpDir || 'tmp'
      this.target = opts.target || opts.name
    } else {
      this.regex = /^application\/json/
    }

    this.req.get(this.url, res => {
      this.statusCode = res.statusCode    
      this.contentType = res.headers['content-type']

      let err
      if (this.statusCode !== 200) {
        err = new Error(`failed, status code: ${this.statusCode}`)
      } else if (!this.regex.test(contentType)) {
        err = new Error(`unexpected content type: ${this.contentType}`)
      }

      if (err) {
        res.resume()
        return this.emit(err)
      }

      if (this.name) {
        this.tmpFile = path.join(this.tmpDir, this.name)
        this.ws = fs.createWriteStream(this.tmpFile)
        this.ws.on('finish', () => {
          this.
        })
        this.rs.pipe(this.ws) 
      } else {
        res.setEncoding('utf8')
        this.data = ''
        res.on('data', chunk => this.data += chunk)
        res.on('end', () => {
          try {
            let data = JSON.parse(this.data)
            this.emit(data)
          } catch (e) {
            this.emit(e)
          }
        })
      }
    })
  }
}

module.exports = (opts, callback) => {
  let { name, url, target, type } = opts
  type = type || 'application/json'

  req.get(url, res => {

    statusCode = 

    if (res.statusCode !== 200) {
      callback(new Error('invalid status code'))
      return res.resume()     
    }

    const { statusCode } = res 
    const contentType = res.headers['content-type']

    let err
    if (statusCode !== 200) {
      err = new Error('failed
    }
  }) 

   
}
