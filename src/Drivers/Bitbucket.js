/**
 * Created by Raphson on 1/4/17.
 */
'use strict'

/*
 * adonis-ally
 *
 * (c) Ayeni Olusegun <nsegun5@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const CE = require('../Exceptions')
const OAuth2Scheme = require('../Schemes/OAuth2')
const AllyUser = require('../AllyUser')
const got = require('got')
const utils = require('../../lib/utils')
const _ = utils.mixLodash(require('lodash'))

class Bitbucket extends OAuth2Scheme {

  constructor (Config) {
    const config = Config.get('services.ally.bitbucket')

    if (!_.hasAll(config, ['clientId', 'clientSecret', 'redirectUri'])) {
      throw CE.OAuthException.missingConfig('bitbucket')
    }

    super(config.clientId, config.clientSecret, config.headers)

      /**
       * Oauth specific values to be used when creating the redirect
       * url or fetching user profile.
       */
    this._scope = this._getInitialScopes(config.scope)
    this._redirectUri = config.redirectUri
    this._redirectUriOptions = _.merge({response_type: 'code'}, config.options)
  }

  /**
   * Injections to be made by the IoC container
   *
   * @return {Array}
   */
  static get inject () {
    return ['Adonis/Src/Config']
  }

  /**
   * Scope seperator for seperating multiple
   * scopes.
   *
   * @return {String}
   */
  get scopeSeperator () {
    return ' '
  }

  /**
   * Base url to be used for constructing
   * bitbucket oauth urls.
   *
   * @return {String}
   */
  get baseUrl () {
    return 'https://bitbucket.org/'
  }

  /**
   * Relative url to be used for redirecting
   * user.
   *
   * @return {String} [description]
   */
  get authorizeUrl () {
    return 'site/oauth2/authorize'
  }

  /**
   * Relative url to be used for exchanging
   * access token.
   *
   * @return {String}
   */
  get accessTokenUrl () {
    return 'site/oauth2/access_token'
  }

  /**
   * Returns initial scopes to be used right from the
   * config file. Otherwise it will fallback to the
   * commonly used scopes
   *
   * @param   {Array} scopes
   *
   * @return  {Array}
   *
   * @private
   */
  _getInitialScopes (scopes) {
    return _.size(scopes) ? scopes : ['account', 'email']
  }

  /**
   * Returns the user profile as an object using the
   * access token
   *
   * @param   {String} accessToken
   *
   * @return  {Object}
   *
   * @private
   */
  * _getUserProfile (accessToken) {
    const profileUrl = `${this.baseUrl}api/2.0/user?access_token=${accessToken}`
    const response = yield got(profileUrl, {
      headers: {
        'Accept': 'application/json'
      },
      json: true
    })
    return response.body
  }

  /**
   * Returns the user emails as an object using the
   * access token
   *
   * @param   {String} accessToken
   *
   * @return  {Object}
   *
   * @private
  */
  * _getUserEmail (accessToken) {
    const profileUrl = `${this.baseUrl}api/2.0/user/emails?access_token=${accessToken}`
    const response = yield got(profileUrl, {
      headers: {
        'Accept': 'application/json'
      },
      json: true
    })
    return response.body
  }

  /**
   * Returns the redirect url for a given provider.
   *
   * @param  {Array} scope
   *
   * @return {String}
   */
  * getRedirectUrl (scope) {
    scope = _.size(scope) ? scope : this._scope
    return this.getUrl(this._redirectUri, scope, this._redirectUriOptions)
  }

  /**
   * Parses the redirect errors returned by bitbucket
   * and returns the error message.
   *
   * @param  {Object} queryParams
   *
   * @return {String}
   */
  parseRedirectError (queryParams) {
    return queryParams.error_description || queryParams.error || 'Oauth failed during redirect'
  }

  /**
   * Returns the user profile with it's access token, refresh token
   * and token expiry
   *
   * @param {Object} queryParams
   *
   * @return {Object}
   */
  * getUser (queryParams) {
    const code = queryParams.code

    /**
     * Throw an exception when query string does not have
     * code.
     */
    if (!code) {
      const errorMessage = this.parseRedirectError(queryParams)
      throw CE.OAuthException.tokenExchangeException(errorMessage, null, errorMessage)
    }

    const accessTokenResponse = yield this.getAccessToken(code, this._redirectUri, {
      grant_type: 'authorization_code'
    })
    const userProfile = yield this._getUserProfile(accessTokenResponse.accessToken)
    const userEmail = yield this._getUserEmail(accessTokenResponse.accessToken)
    userProfile.emails = []
    userEmail.values.forEach(function (email) {
      userProfile.emails.push({ value: email.email, primary: email.is_primary, verified: email.is_confirmed })
    })
    const user = new AllyUser()
    user.setOriginal(userProfile)
      .setFields(userProfile.uuid, userProfile.display_name, userProfile.emails[0].value, userProfile.username, userProfile.links.avatar.href)
      .setToken(accessTokenResponse.accessToken, accessTokenResponse.refreshToken, null, Number(_.get(accessTokenResponse, 'result.expires_in')))

    return user
  }
}

module.exports = Bitbucket