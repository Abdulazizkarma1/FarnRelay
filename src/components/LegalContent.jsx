import React from 'react';
import {en} from '../i18n/en.js';
import './LegalContent.css';
export default function LegalCopy(){return <div className="legal-copy"><p>{en.legal.intro}</p>{en.legal.sections.map(([title,body])=><section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p>{en.legal.version}</p></div>;}
