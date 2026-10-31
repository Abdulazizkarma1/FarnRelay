import React from 'react';
import {en} from '../i18n/en.js';
import LegalCopy from './LegalContent.jsx';
import AuthLayout from './AuthLayout.jsx';
import './InfoPage.css';
export default function InfoPage({kind}){return <AuthLayout title={kind==='terms'?en.legal.title:en.notFound.title} description={kind==='terms'?undefined:en.notFound.body}>{kind==='terms'&&<LegalCopy/>}<a className="ds-button ds-primary" href="/about">{en.notFound.action}</a></AuthLayout>;}
