const express = require('express');
const nunjucks = require('nunjucks');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const fs = require('fs');
const klaw = require('klaw-sync');
const crypto = require('crypto');
const niv = require('node-input-validator');
const path = require('path');
const User = require('./models/User');
const Setting = require('./models/Setting');
const Notification = require('./models/Notification');

const config = require('./config.json');

const app = express();

mongoose.connect(config.databases.website, {
	useNewUrlParser: true,
	useUnifiedTopology: true
});

app.set('json spaces', 4);
app.set('views', './views');
app.set('view engine', 'njk');

const nunjucksEnvironment = new nunjucks.Environment(new nunjucks.FileSystemLoader('views', { noCache: true }), { autoescape: true });
nunjucksEnvironment.express(app);

nunjucksEnvironment.addFilter('in', function(str, arr, attr = 'id') {
	return arr.some((item) => item[attr] === str);
});

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(cookieSession({
	name: 'session',
	secret: config.sessionSecret,
	maxAge: 1000 * 60 * 60 * 24 * 7,
	sameSite: 'lax',
	path: '/',
	secure: process.env.NODE_ENV === 'production',
	httpOnly: true,
	saveUninitialized: false,
	resave: true,
	signed: true
}));

app.use(flash());

app.use((req, res, next) => {

	req.pathArr = req.path.split('/').filter(Boolean);
	req.referer = req.headers.referer || '/';
	req.session.csrfToken = req.session.csrfToken || crypto.randomBytes(256).toString('base64');

	next();
	
});

app.use(async (req, res, next) => {

	req.isUserAuthenticated = false;
	req.authenticatedUser = null;

	if (req.session.authenticatedUser) {

		const authenticatedUser = await User.findById(req.session.authenticatedUser);
		if (!authenticatedUser || !authenticatedUser.isActive) {
			req.session.authenticatedUser = null;
			return res.redirect('/');
		}

		req.isUserAuthenticated = true;
		req.authenticatedUser = authenticatedUser;
		
	}

	next();
	
});

app.use(async (req, res, next) => {

	const settings = await Setting.getSettings();

	const successMessageFlash = req.flash('successMessage');
	const errorMessageFlash = req.flash('errorMessage');

	let notificationsCount = 0;
	if (req.isUserAuthenticated && req.path !== '/notifications') {
		const notifications = await Notification.find({ user: req.authenticatedUser.id, isRead: false });
		notificationsCount = notifications.length;
	}

	res.context = {
		siteName: settings.siteName || 'Website',
		siteDescription: settings.siteDescription || '',
		siteLink: settings.siteLink || '//',
		page: null,
		title: null,
		reqPath: req.path,
		reqReferer: req.referer,
		isUserAuthenticated: req.isUserAuthenticated,
		authenticatedUser: await req.authenticatedUser?.format(),
		notificationsCount: notificationsCount,
		successMessage: successMessageFlash[0],
		errorMessage: errorMessageFlash[0],
		csrfToken: req.session.csrfToken
	};

	res._render = res.render;
	
	res.render = (template) => {
		res._render(template + '.njk', res.context);
	}

	res.reload = () => {
		res.redirect(req.originalUrl);
	}

	res.throwError = (error) => {

		res.context.page = 'error';
		res.context.title = 'Error';

		res.context.error = error;

		res.render('error');

	}

	res.throw404 = () => {

		res.status(404);
		res.throwError('The requested page could not be found.');

	}

	res._json = res.json;

	res.json = (type, data) => {

		if (type === 'success') {

			if (data) {
				res._json({ success: true, data: data });
			} else {
				res._json({ success: true });
			}

		} else if (type === 'error') {

			if (data) {
				res._json({ success: false, error: data });
			} else {
				res._json({ success: false });
			}

		} else {

			if (data) {
				res._json({ data: data });
			} else {
				res._json({ });
			}

		}

	}

	next();

});

app.use(async (req, res, next) => {

	req.validateInput = async (validationRules, callback) => {

		const validation = new niv.Validator(req.body, validationRules);
		await validation.check();

		validation.error = null;
		if (Object.values(validation.errors).length > 0) {
			validation.error = Object.values(validation.errors)[0].message;
		}

		if (!callback) {
			if (validation.error) {
				req.flash('errorMessage', validation.error);
				res.redirect(req.referer);
				return false;
			}
		} else {
			await callback(validation);
		}

		return validation;

	}

	next();

});

app.use(async (req, res, next) => {

	if (!req.path.startsWith('/panel')) {
		return next();
	}

	await require('./routes/panel/_init.js')(app, req, res, next);

});

const routeFiles = klaw('./routes').map((file) => file.path);
for (const file of routeFiles) {

	const fileName = path.basename(file);
	if (fileName.startsWith('_') || !fileName.endsWith('.js')) {
		continue;
	}

	try {
		require(`${file}`)(app);
	} catch (error) {
		console.log(error);
	}

}

app.get('*', (req, res) => {
	res.throw404();
});

const serviceFiles = klaw('./services').map((file) => file.path);
for (const file of serviceFiles) {

	const fileName = path.basename(file);
	if (fileName.startsWith('_') || !fileName.endsWith('.js')) {
		continue;
	}

	try {
		require(`${file}`)(app);
	} catch (error) {
		console.log(error);
	}

}

const port = process.env.PORT || config.port || 3000;
app.listen(port, () => console.log(`Listening on port ${port}...`));