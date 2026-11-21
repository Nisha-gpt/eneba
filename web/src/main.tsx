import { useEffect, useMemo, useState, useRef, createContext, useContext } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleUserRound, Gamepad2, KeyRound, Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Monitor, Joystick, Gamepad, Menu, X, ChevronLeft, ChevronRight, Globe, Heart, Gift, Star, Wallet, CreditCard, Trash2, Swords, Compass, Target, Flag, Flame } from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import './style.css';

type Product = {featured_offer?:{id:number;cents:number;seller:string;stock?:number}|null;id:number; slug:string; name:string; platform:string; region:string; genre:string; description:string; activation:string; artwork:string; attributes:Record<string,string>; cents:number|null};
type CardProduct = Pick<Product,'id'|'slug'|'name'|'platform'|'region'|'artwork'|'attributes'|'cents'|'featured_offer'>;
type Offer = {id:number; seller:string; cents:number; stock:number};
type Item = {offer:number; quantity:number; name:string; seller:string; cents:number; slug:string};
type User = {email:string};
type Order = {id:number; cents:number; created_at:string};
type OrderDetail = Order & {payment_method:'card'|'wallet'; delivery_email:string|null; items:{id:number; product:string; seller:string; cents:number; quantity:number; keys:string[]; artwork:string; platform:string; region:string; activation:string}[]};
type Banner = {campaigns:{title:string;subtitle:string;destination:string;artwork:string}[];mobile_artwork?:string;eyebrow:string; headline:string; subtitle:string; action:string; destination:string; artwork:string};

type Preferences={country:string;language:'en'|'es';currency:'EUR'|'USD'|'GBP'};
const defaultPreferences:Preferences={country:'India',language:'en',currency:'EUR'};
const currencyRates={EUR:1,USD:1.10,GBP:0.85};
const countries:Record<string,string>={India:'Asia',Germany:'Europe',France:'Europe','United Kingdom':'Europe','United States':'North America',Canada:'North America',Spain:'Europe'};
const translations:Record<string,string>={
  'Update your settings':'Actualiza tus preferencias',Region:'Región',Language:'Idioma',Currency:'Moneda',Close:'Cerrar',Cancel:'Cancelar',Save:'Guardar',
  'Settings saved.':'Preferencias guardadas.',Categories:'Categorías',Games:'Juegos','Cheap Games':'Juegos baratos',Software:'Software','Gift Guide':'Guía de regalos',
  'eGift Cards':'Tarjetas regalo digitales','Eneba Gift Cards':'Tarjetas regalo de Eneba','Recently viewed':'Vistos recientemente','Recommended for you':'Recomendados para ti',
  'Top games':'Juegos destacados','Best selling eGift Cards':'Tarjetas digitales más vendidas','Best selling gift cards':'Tarjetas regalo más vendidas',
  'Upcoming games':'Próximos juegos','Load more':'Cargar más','Show all':'Ver todo','Add to cart':'Añadir al carrito','View offers':'Ver ofertas',
  'Log in':'Iniciar sesión',Register:'Registrarse',Orders:'Pedidos',Cart:'Carrito',Payment:'Pago','Get your product':'Recibe tu producto',
  'Search for games, top-ups and more':'Busca juegos, recargas y más','Payment successful':'Pago realizado','Proceed to checkout':'Continuar con el pago',
  'My cart':'Mi carrito','Order summary':'Resumen del pedido',Total:'Total','Service fee':'Comisión de servicio',
  'How would you like to pay?':'¿Cómo quieres pagar?','Credit or debit card':'Tarjeta de crédito o débito',
  'Pay with your Eneba wallet balance.':'Paga con el saldo de tu cartera Eneba.','Pay with Visa or Mastercard.':'Paga con Visa o Mastercard.',
  'Test mode — no real charges':'Modo de prueba — sin cargos reales','Test payment details':'Datos de pago de prueba',
  'Delivery email':'Correo de entrega','Where to deliver the order?':'¿Dónde quieres recibir el pedido?',Edit:'Editar',Summary:'Resumen',
  Subtotal:'Subtotal','Back to cart':'Volver al carrito','Cardholder name':'Titular de la tarjeta','Card number':'Número de tarjeta','Expiry date':'Caducidad',
  Pay:'Pagar','Processing…':'Procesando…','View orders':'Ver pedidos','Continue shopping':'Seguir comprando',
};

function activationEligibility(region:string,country:string|undefined,selected:string) {
  if(region==='Global') return `Can be activated in ${selected}.`;
  if(country && country!=='Worldwide' && !Object.values(countries).includes(country)) {
    if(country in countries) return country===selected?`Can be activated in ${selected}.`:`This offer is for ${country}; it cannot be activated in ${selected}.`;
  }
  return countries[selected]===region||selected===region
    ? `Can be activated in ${selected}.`
    : `This offer is restricted to ${region}; it cannot be activated in ${selected}.`;
}

function SettingsControl() {
  const {preferences,openSettings}=useMarket();
  return <button type="button" className="settings-control" onClick={openSettings} aria-haspopup="dialog" aria-label="Language and currency">
    <Globe size={17}/><span>{preferences.language==='es'?'Español':'English'} · {preferences.currency}</span>
  </button>;
}

function SettingsDialog({onClose,onSave,preferences}:{onClose:()=>void;onSave:(value:Preferences)=>void;preferences:Preferences}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState(preferences);
  const t=(text:string)=>preferences.language==='es'?translations[text]??text:text;
  useEffect(()=>{
    const dialog=ref.current!;
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.showModal();
    return ()=>{dialog.close();document.body.style.overflow=overflow;trigger?.focus();};
  },[]);
  return <dialog className="settings-dialog" ref={ref} aria-labelledby="settings-title"
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget) onClose();}}>
    <form onSubmit={event=>{event.preventDefault();onSave(draft);}}>
      <div className="settings-head"><h2 id="settings-title">{t('Update your settings')}</h2><button type="button" aria-label={t('Close')} onClick={onClose}><X size={20}/></button></div>
      <label>{t('Region')}<select value={draft.country} onChange={e=>setDraft({...draft,country:e.target.value})}>{Object.keys(countries).map(country=><option key={country}>{country}</option>)}</select></label>
      <label>{t('Language')}<select value={draft.language} onChange={e=>setDraft({...draft,language:e.target.value as Preferences['language']})}><option value="en">English</option><option value="es">Español</option></select></label>
      <label>{t('Currency')}<select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value as Preferences['currency']})}>{Object.keys(currencyRates).map(currency=><option key={currency}>{currency}</option>)}</select></label>
      <small>Currency equivalents use fixed demo rates. Orders and wallet balances are recorded in EUR.</small>
      <div className="actions"><button type="button" className="button secondary" onClick={onClose}>{t('Cancel')}</button><button className="button primary">{t('Save')}</button></div>
    </form>
  </dialog>;
}

class RequestError extends Error {
  constructor(message:string, readonly status:number) { super(message); }
}

async function api<T>(path:string, body?:unknown, signal?:AbortSignal):Promise<T> {
  const response = await fetch('/api'+path, {
    signal,
    ...(body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
  });
  const media = response.headers.get('Content-Type')?.split(';', 1)[0].trim();
  if (media !== 'application/json') {
    throw new RequestError('The store is temporarily unavailable. Please try again.', response.status);
  }
  const data = await response.json().catch(() => {
    throw new RequestError('The store returned an unreadable response. Please try again.', response.status);
  });
  if (!response.ok) throw new RequestError(data?.error || 'Request failed.', response.status);
  return data as T;
}

function useData<T>(path:string): {data?:T; error?:string; previous?:T} {
  const [result,setResult] = useState<{path:string; data?:T; error?:string}>({path:''});
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path,undefined,controller.signal).then(data => setResult({path,data})).catch(error => {
      if (!controller.signal.aborted) setResult({path,error:error.message});
    });
    return () => controller.abort();
  },[path]);
  return result.path === path ? result : {previous:result.data};
}

function saved<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

type Market = {preferences:Preferences;t:(text:string)=>string;money:(cents:number)=>string;openSettings:()=>void;navigation:{data?:Category[];error?:string};history:string[];recordView:(slug:string)=>void;deliveryEmail:string|null;setDeliveryEmail:(email:string)=>void;quickOrder:Item|null; setQuickOrder:(item:Item|null)=>void; wishlist:string[]; toggleWishlist:(slug:string)=>void; cart:Item[]; setCart:(items:Item[])=>void; user:User|null|undefined; setUser:(u:User|null)=>void; sessionError:string; notice:(s:string)=>void};
const MarketContext = createContext<Market>(null!);
const useMarket = () => useContext(MarketContext);
const ErrorText = ({message}:{message:string}) => <p className="feedback error" role="alert">{message}</p>;
const Loading = () => <p className="feedback" role="status">Loading…</p>;
function Empty({title,children}:{title:string; children?:ReactNode}) {
  return <div className="empty"><Gamepad2 size={34}/><h2>{title}</h2>{children}</div>;
}
function Breadcrumb({children}:{children:ReactNode}) {
  return <div className="crumb"><Link to="/">Home</Link><span>/</span>{children}</div>;
}

function Brand() {
  return <Link to="/" className="brand" aria-label="Eneba home">
    <img className="eneba-mark" src="/favicon.svg" alt=""/><span>eneba</span>
  </Link>;
}

type Category = {slug:string; parent:string|null; name:string; heading:string; rank:number; nav_rank:number|null};
const categoryPath = (slug:string) => '/store/'+slug;

function Drawer({title,children,onClose,leading,heading}:{title:string;children:ReactNode;onClose:()=>void;leading?:ReactNode;heading?:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current!;
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.showModal();
    return ()=>{
      dialog.close();
      document.body.style.overflow=previous;
      trigger?.focus();
    };
  },[]);
  return <dialog ref={ref} className="side-drawer" aria-label={title}
    onCancel={e=>{e.preventDefault();onClose();}}
    onClick={e=>{if(e.target===e.currentTarget) onClose();}}>
    <div className="drawer-content">
      <div className="drawer-header"><div>{leading}{heading??<strong>{title}</strong>}</div><button aria-label="Close drawer" onClick={onClose}><X size={21}/></button></div>
      {children}
    </div>
  </dialog>;
}

function CategoryDrawer({categories,onClose,error}:{categories:Category[];onClose:()=>void;error?:string}) {
  const [parent,setParent]=useState<Category|null>(null);
  const back=useRef<HTMLButtonElement>(null);
  const lastCategory=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    if(parent) back.current?.focus();
    else if(lastCategory.current) document.getElementById(lastCategory.current.id)?.focus();
  },[parent]);
  return <Drawer title={parent?.name??'Categories'} onClose={onClose}
    heading={!parent?<span className="brand" aria-hidden="true"><img className="eneba-mark" src="/favicon.svg" alt=""/><span>eneba</span></span>:undefined}
    leading={parent&&<button aria-label="Back to categories" ref={back} onClick={()=>setParent(null)}><ChevronLeft size={18}/></button>}>
    <nav className="drawer-links" aria-label={parent?.name??'Categories'}>
      <Link to={parent?categoryPath(parent.slug):'/store'} onClick={onClose}>All offers</Link>
      {error && <ErrorText message={error}/>}
      {!error && !categories.length && <Loading/>}
      {categories.filter(c=>c.parent===(parent?.slug??null) && c.slug!=='cheap-games').map(c=>
        categories.some(child=>child.parent===c.slug)
        ? <button id={'drawer-category-'+c.slug} key={c.slug} onClick={e=>{lastCategory.current=e.currentTarget;setParent(c);}}>{c.name}<ChevronRight size={17}/></button>
        : <Link key={c.slug} to={categoryPath(c.slug)} onClick={onClose}>{c.name}</Link>)}
    </nav>
  </Drawer>;
}

const marketplaceLinks = [
  {name:'Games',path:'/store/games',icon:Gamepad2},
  {name:'Gaming eCards',path:'/store/gaming-ecards',icon:Gamepad},
  {name:'eGift Cards',path:'/store/e-gift-cards',icon:Gift},
  {name:'Steam',path:'/store/steam',icon:Monitor},
  {name:'PSN',path:'/store/psn',icon:Gamepad},
  {name:'Xbox',path:'/store/xbox',icon:Gamepad2},
  {name:'Nintendo',path:'/store/nintendo',icon:Joystick},
];

function Header() {
  const {cart,user,wishlist,navigation,t} = useMarket();
  const navigate = useNavigate();
  const {pathname,search} = useLocation();
  const query = pathname.startsWith('/store') ? new URLSearchParams(search).get('q') ?? '' : '';
  const [value,setValue] = useState(query);
  const [drawer,setDrawer]=useState(false);
  const links=(navigation.data??[]).filter(c=>c.nav_rank!==null).sort((a,b)=>a.nav_rank!-b.nav_rank!);
  useEffect(() => setValue(query),[query,pathname]);
  useEffect(()=>setDrawer(false),[pathname,search]);
  function submit(e:FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) params.set('q',value.trim());
    navigate('/store'+(params.size ? '?'+params : ''));
  }
  return <header className="site-header">
    <div className="wrap nav">
      <Brand/>
      <form className="search" onSubmit={submit} role="search">
        <Search size={22}/><input aria-label="Search games" placeholder={t('Search for games, top-ups and more')} value={value} onChange={e=>setValue(e.target.value)} maxLength={100}/>
        <button aria-label="Submit search"><ArrowRight size={17}/></button>
      </form>
      <div className="utilities">
        <SettingsControl/>
        <Link className="icon-link" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`}><Heart size={22}/>{wishlist.length>0&&<b>{wishlist.length}</b>}</Link>
        <Link className="bag" to="/cart" aria-label={`Cart, ${cart.reduce((sum,i)=>sum+i.quantity,0)} items`}><ShoppingCart size={22}/><b>{cart.reduce((sum,i)=>sum+i.quantity,0)}</b></Link>
        <Link to={user ? '/orders' : '/login'} aria-label={user ? 'Your orders' : 'Sign in'}><CircleUserRound size={22}/><span>{t(user ? 'Orders' : 'Log in')}</span></Link>
        {!user&&<Link className="register-nav" to="/register">{t('Register')}</Link>}
      </div>
    </div>
    <div className="market-nav"><nav className="wrap" aria-label="Marketplace">
      <button onClick={()=>setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer}><Menu size={20}/> {t('Categories')}</button>
      {links.map(c=><NavLink key={c.slug} to={categoryPath(c.slug)}>{t(c.name)}</NavLink>)}
      {navigation.data?.some(c=>c.slug==='gift-guide')&&<NavLink to="/store/gift-guide">Gift Guide</NavLink>}
    </nav></div>
    {drawer&&<CategoryDrawer categories={navigation.data??[]} error={navigation.error} onClose={()=>setDrawer(false)}/>}
  </header>;
}

function ProductArtwork({product}:{product:Pick<CardProduct,'artwork'|'attributes'|'platform'>}) {
  if(product.artwork) return <img src={product.artwork} alt="" loading="lazy" onError={e=>e.currentTarget.hidden=true}/>;
  return <div className={'catalog-art art-'+(product.attributes.tone??'violet')} aria-hidden="true">
    <div>{product.attributes.type==='Software'?<Monitor size={40}/>:<Gift size={40}/>}<strong>{product.attributes.brand??product.platform}</strong>
      <span>{product.attributes.denomination ? product.attributes.denomination+' '+product.attributes.currency : product.attributes.type}</span></div>
  </div>;
}

function Card({product,actions=false}:{product:CardProduct;actions?:boolean}) {
  const {money,wishlist,toggleWishlist,cart,setCart,notice,t}=useMarket();
  const navigate=useNavigate();
  const offer=product.featured_offer;
  function add(){
    if(!offer)return;
    const previous=cart.find(item=>item.offer===offer.id);
    if(previous&&previous.quantity>=Math.min(20,offer.stock??20)){
      notice('You have reached the available quantity.');return;
    }
    if(!previous&&cart.length>=20){notice('Your cart can hold up to 20 offers.');return;}
    const item={offer:offer.id,quantity:(previous?.quantity??0)+1,name:product.name,seller:offer.seller,cents:offer.cents,slug:product.slug};
    setCart(previous?cart.map(line=>line.offer===item.offer?item:line):[...cart,item]);
    navigate('/cart');
  }
  const saved=wishlist.includes(product.slug);
  return <article className={'card-shell'+(actions?' carousel-card':'')}>
    <Link className="card" to={'/product/'+product.slug}>
      <div className={'poster tone-'+product.id%6}>
        <span className="poster-fallback" aria-hidden="true">{product.name}</span>
        <ProductArtwork product={product}/>
        <span className="tag">{product.platform}</span>
      </div>
      <div className="card-body"><h3>{product.name}</h3><div className="eyebrow region" data-global={product.region==='Global'}>{product.region}</div>
        <div className="card-bottom"><div>{product.cents === null ? <span>Out of stock</span> : <><small>From</small><strong>{money(product.cents)}</strong></>}</div></div>
      </div>
    </Link>
    {actions&&<div className="carousel-card-actions">
      <button className="button primary" disabled={!offer} onClick={add}>{t('Add to cart')}</button>
      <Link className="button secondary" to={'/product/'+product.slug+'#seller-offers'}>{t('View offers')}</Link>
    </div>}
    <button className="wishlist-toggle" aria-label={`${saved?'Remove':'Save'} ${product.name} ${saved?'from':'to'} wishlist`} aria-pressed={saved} onClick={()=>toggleWishlist(product.slug)}><Heart size={18} fill={saved?'currentColor':'none'}/></button>
  </article>;
}

function SavedProduct({slug}:{slug:string}) {
  const {data,error}=useData<Product & {offers:Offer[]}>('/products/'+encodeURIComponent(slug));
  if(error) return <ErrorText message={error}/>;
  if(!data) return <Loading/>;
  const available=data.offers.find(offer=>offer.stock>0);
  return <Card product={{...data,cents:available?.cents??null}}/>;
}

function Wishlist() {
  const {wishlist}=useMarket();
  return <div className="inner"><h1>Wishlist</h1>{wishlist.length
    ? <div className="grid">{wishlist.map(slug=><SavedProduct key={slug} slug={slug}/>)}</div>
    : <Empty title="Your wishlist is empty"><Link className="button primary" to="/store">Browse all offers</Link></Empty>}</div>;
}

function Carousel({children,label,kind='products'}:{children:ReactNode;label:string;kind?:'products'|'shortcuts'|'brands'}) {
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:false,right:false});
  function update(){
    const row=ref.current;
    if (!row) return;
    const next={left:row.scrollLeft>2,right:row.scrollLeft+row.clientWidth+2<row.scrollWidth};
    setPosition(old=>old.left===next.left&&old.right===next.right?old:next);
  }
  useEffect(()=>{
    const row=ref.current;
    if(!row)return;
    const observer=new ResizeObserver(update);
    observer.observe(row);
    for(const child of row.children) observer.observe(child);
    update();
    return ()=>observer.disconnect();
  },[children]);
  function move(direction:number) {
    const row=ref.current;
    if(row) row.scrollBy({left:direction*row.clientWidth*.82,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  return <div className={'carousel carousel-'+kind}>
    <div className="carousel-track" ref={ref} aria-label={label} tabIndex={position.left||position.right?0:undefined} onScroll={update}>{children}</div>
    {position.left&&<button className="carousel-arrow previous" aria-label={'Previous '+label} onClick={()=>move(-1)}><ChevronLeft size={20}/></button>}
    {position.right&&<button className="carousel-arrow next" aria-label={'Next '+label} onClick={()=>move(1)}><ChevronRight size={20}/></button>}
  </div>;
}

function Collection({path,background=false}:{path:string;background?:boolean}) {
  const {t}=useMarket();
  const {data,error}=useData<{title:string;label:string;browse_path:string;items:CardProduct[]}>('/home/'+path);
  return <section className={'home-band'+(background?' home-band-deep':'')}>
    {error?<ErrorText message={error}/>:!data?<Loading/>:<>
      <h2>{t(data.title)}</h2>
      {data.items.length?<Carousel label={t(data.title)}>{data.items.map(p=><Card key={p.id} product={p} actions/>)}</Carousel>:<p>No products in this collection.</p>}
      <div className="home-show-all"><Link className="button secondary" to={data.browse_path}>{t('Show all')}</Link></div>
    </>}
  </section>;
}

function RecentlyViewed({history}:{history:string[]}) {
  const {t}=useMarket();
  const query=new URLSearchParams(history.map(slug=>['slug',slug]));
  const {data,error}=useData<CardProduct[]>('/home/recent?'+query);
  return <section className="home-band">
    <h2>{t('Recently viewed')}</h2>
    {error?<ErrorText message={error}/>:!data?<Loading/>:data.length
      ?<Carousel label={t('Recently viewed')}>{data.map(p=><Card key={p.id} product={p} actions/>)}</Carousel>
      :<p>No recently viewed products yet.</p>}
  </section>;
}

function GiftBrands() {
  const {t}=useMarket();
  const {data,error}=useData<{name:string;tone:string}[]>('/home/gift-brands');
  const label=t('Best selling eGift Cards');
  return <section className="home-band">
    <h2>{label}</h2>
    {error?<ErrorText message={error}/>:!data?<Loading/>:<>
      <Carousel label={label} kind="brands">{data.map(brand=><Link key={brand.name} className={'brand-tile art-'+brand.tone}
        to={'/store/e-gift-cards?'+new URLSearchParams({brand:brand.name})}><Gift size={33}/><strong>{brand.name}</strong></Link>)}</Carousel>
      <div className="home-show-all"><Link className="button secondary" to="/store/e-gift-cards">{t('Show all')}</Link></div>
    </>}
  </section>;
}

const genreIcons:Record<string,typeof Gamepad2>={
  Action:Swords,'Action RPG':Swords,Adventure:Compass,Exploration:Compass,Simulation:Gamepad,
  Strategy:Target,Racing:Flag,'Role Playing':ShieldCheck,Puzzle:Gamepad2,Survival:Flame,
};
function HomepageGenres() {
  const {data,error}=useData<{name:string;count:number}[]>('/home/genres');
  const {t}=useMarket();
  const [limit,setLimit]=useState(7);
  return <section className="home-band home-genres">
    <h2>{t('Categories')}</h2>
    {error?<ErrorText message={error}/>:!data?<Loading/>:<>
      <div className="genre-tiles">{data.slice(0,limit).map(genre=>{
        const Icon=genreIcons[genre.name]??Gamepad2;
        return <Link key={genre.name} to={'/store/games?'+new URLSearchParams({genre:genre.name})}>
          <strong>{genre.count}</strong><Icon size={33}/><span>{genre.name}</span>
        </Link>;
      })}</div>
      {limit<data.length&&<div className="home-show-all"><button className="button secondary" onClick={()=>setLimit(limit+7)}>{t('Load more')}</button></div>}
    </>}
  </section>;
}

function Home() {
  const {data,error}=useData<Banner>('/home/banner');
  const {history,navigation,t}=useMarket();
  const shortcuts=(navigation.data??[]).filter(c=>!c.parent||['steam','eneba-gift-cards'].includes(c.slug)).filter(c=>c.slug!=='cheap-games');
  return <>
    <div className="campaign-strip">
      <section className="hero">
        {error?<ErrorText message={error}/>:!data?<Loading/>:<>
          <picture>{data.mobile_artwork&&<source media="(max-width: 720px)" srcSet={data.mobile_artwork}/>}<img className="hero-art" src={data.artwork} alt="" fetchPriority="high" onError={e=>e.currentTarget.hidden=true}/></picture>
          <div className="hero-content">
            <div className="eyebrow hero-tag"><span/>{data.eyebrow}</div>
            <h1>{data.headline}</h1><p>{data.subtitle}</p>
            <Link className="button primary" to={data.destination}>{data.action}<ArrowRight size={19}/></Link>
          </div>
        </>}
      </section>
      {data?.campaigns.map((campaign,index)=><Link key={campaign.destination} className={'campaign-tile campaign-'+index} to={campaign.destination}>
        {campaign.artwork?<img src={campaign.artwork} alt="" loading="lazy"/>:index===1?<Gift className="campaign-decoration" size={72}/>:<Monitor className="campaign-decoration" size={72}/>}
        <span><strong>{campaign.title}</strong><small>{campaign.subtitle}</small></span>
      </Link>)}
    </div>
    <div className="home-shortcuts" id="market">
    {navigation.error?<ErrorText message={navigation.error}/>:navigation.data?
      <Carousel label="Category shortcuts" kind="shortcuts">{shortcuts.map(category=>{
        const Icon=marketplaceLinks.find(link=>link.path===categoryPath(category.slug))?.icon??Gamepad2;
        return <Link key={category.slug} to={categoryPath(category.slug)}><Icon size={26}/>{t(category.name)}</Link>;
      })}</Carousel>:<Loading/>}
    </div>
    {history.length>0&&<RecentlyViewed history={history}/>}
    <Collection path="recommended"/>
    <Collection path="top-games" background/>
    <GiftBrands/>
    <Collection path="gift-cards" background/>
    <Collection path="upcoming"/>
    <Collection path="deals" background/>
    <HomepageGenres/>
  </>;
}

const filterNames:Record<string,string> = {
  country:'Country',type:'Type',os:'Operating system',platform:'Platforms',
  brand:'Brand',region:'Region',currency:'Currency',denomination:'Denomination',genre:'Genre',
};
type FacetOption={value:string;count:number};
type Listing={items:Product[];total:number;pageSize:number;category:Category|null;collection?:string|null;facets:Record<string,FacetOption[]>};

function Facet({name,options,selected,change}:{name:string;options:FacetOption[];selected:string[];change:(value:string)=>void}) {
  const [search,setSearch]=useState('');
  const values = [...options,...selected.filter(value=>!options.some(option=>option.value===value)).map(value=>({value,count:0}))];
  return <details className="facet" open>
    <summary>{name}{selected.length>0&&<span>{selected.length}</span>}</summary>
    {(values.length>5||search)&&<input type="search" aria-label={'Search '+name.toLowerCase()} placeholder={'Search '+name.toLowerCase()} value={search}
      onChange={event=>setSearch(event.target.value)}/>}
    <div className="facet-options">{values.filter(option=>option.value.toLowerCase().includes(search.toLowerCase())).map(option=>
      <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)}
        onChange={()=>change(option.value)}/><span>{option.value}</span><small aria-label={option.count+' products'}>{option.count}</small></label>)}</div>
  </details>;
}

function PriceRange({min,max,onApply}:{min:string;max:string;onApply:(min:string,max:string)=>void}) {
  const {preferences,money}=useMarket();
  const rate=currencyRates[preferences.currency];
  const [error,setError]=useState('');
  function apply(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const limits=['min','max'].map(key=>String(data.get(key)??'').trim());
    if(limits.some(value=>value&&!/^\d{1,5}(?:\.\d{1,2})?$/.test(value.replace(',','.')))){
      setError('Enter a price with up to two decimals.');
      return;
    }
    const [low,high]=limits.map(value=>value?String(Math.round(Number(value.replace(',','.'))*100/rate)):'');
    if((high&&Number(low)>Number(high))||[low,high].some(value=>Number(value)>1000000)){
      setError('Enter a valid range up to '+money(1000000)+'.');
      return;
    }
    onApply(low,high);
  }
  return <details className="facet price-range" open>
    <summary>Price range ({preferences.currency})</summary>
    <form onSubmit={apply}>
      <div><input name="min" inputMode="decimal" aria-label="Minimum price" placeholder="Min" defaultValue={min?(Number(min)*rate/100).toFixed(2):''}/>
      <span>–</span><input name="max" inputMode="decimal" aria-label="Maximum price" placeholder="Max" defaultValue={max?(Number(max)*rate/100).toFixed(2):''}/></div>
      {error&&<ErrorText message={error}/>}
      <button className="button secondary">Apply price</button>
    </form>
  </details>;
}

function Store() {
  const {money,preferences}=useMarket();
  const {category}=useParams();
  const [params,setParams] = useSearchParams();
  const [filterDrawer,setFilterDrawer]=useState(false);
  const request=new URLSearchParams(params);
  if(category) request.set('category',category);
  else request.delete('category');
  const {data,error,previous} = useData<Listing>('/products?'+request);
  useEffect(()=>{
    if(!data?.category) return;
    document.title=data.category.name+' | Eneba internship marketplace recreation';
    return ()=>{document.title='Eneba — Internship marketplace recreation';};
  },[data?.category?.name]);
  const facets = data?.facets ?? (previous?.category?.slug===category ? previous?.facets : undefined);
  const page = Number(params.get('page') || '1');
  const query = params.get('q') || '';
  const min=params.get('min')??'';
  const max=params.get('max')??'';
  const chips=[...params].filter(([key])=>key in filterNames||key==='min'||key==='max');
  function update(key:string,value:string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }
  function toggle(key:string,value:string){
    const next=new URLSearchParams(params);
    if(next.getAll(key).includes(value)) next.delete(key,value);
    else next.append(key,value);
    next.delete('page');setParams(next);
  }
  function clear(){
    const next=new URLSearchParams(params);
    for(const [key] of chips) next.delete(key);
    next.delete('page');setParams(next);
  }
  const filters=<>
    <PriceRange key={preferences.currency+':'+min+':'+max} min={min} max={max} onApply={(low,high)=>{
      const next=new URLSearchParams(params);
      if(low) next.set('min',low);else next.delete('min');
      if(high) next.set('max',high);else next.delete('max');
      next.delete('page');setParams(next);
    }}/>
    {Object.entries(filterNames).filter(([key])=>facets?.[key]?.length||params.has(key)).map(([key,label])=>
      <Facet key={(category??'')+key} name={label} options={facets?.[key]??[]} selected={params.getAll(key)} change={value=>toggle(key,value)}/>)}
  </>;
  return <div className="inner catalog-page">
    <h1>{query ? `Results for “${query}”` : data?.category?.heading ?? (data?.collection??(category?'Browse category':'All offers'))}</h1>
    <div className="store-layout">
      <aside className="filters catalog-filters" aria-label="Product filters">{filters}</aside>
      {filterDrawer&&<Drawer title="Filters" onClose={()=>setFilterDrawer(false)}><div className="catalog-filters">{filters}</div><button className="button primary show-results" onClick={()=>setFilterDrawer(false)}>Show results</button></Drawer>}
      <div className="results">
        <div className="filter-chips">
          <button className="button secondary mobile-filter" onClick={()=>setFilterDrawer(true)}><SlidersHorizontal size={16}/> Filters</button>
          {chips.map(([key,value])=><button key={key+':'+value} className="filter-chip" onClick={()=>key in filterNames?toggle(key,value):update(key,'')}>
            {key==='min'?'Min '+money(Number(value)):key==='max'?'Max '+money(Number(value)):value}<X size={14}/></button>)}
          {chips.length>0&&<button className="clear-filters" onClick={clear}>Clear all</button>}
        </div>
        <div className="result-head"><span>Results found: <strong>{data?.total??'—'}</strong></span>
          <label><span>Sort by</span> <select aria-label="Sort by" value={params.get('sort')||''} onChange={e=>update('sort',e.target.value)}><option value="">Relevance</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option></select></label></div>
        {error ? <ErrorText message={error}/> : !data ? <Loading/> : data.items.length ? <div className="grid store-grid">{data.items.map(p=><Card key={p.id} product={p}/>)}</div> : <Empty title="No products found"><p>Try a different search or clear your filters.</p><Link className="button secondary" to={category?categoryPath(category):'/store'}>Browse all in this category</Link></Empty>}
        {data && (data.total>data.pageSize || page>1) && <div className="pagination"><button className="button secondary" disabled={page<=1} onClick={()=>update('page',String(page-1))}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><button className="button secondary" disabled={page*data.pageSize>=data.total} onClick={()=>update('page',String(page+1))}>Next</button></div>}
      </div>
    </div>
  </div>;
}

type ProductDetail = Product & {offers:Offer[];release_date:string|null};
type ReviewSummary = {count:number;average:number|null;items:{id:number;rating:number;body:string;updated_at:string}[]};

function Recommendations({slug,title='Gamers also viewed'}:{slug:string;title?:string}) {
  const path='/products/'+encodeURIComponent(slug)+'/recommendations';
  const {data,error}=useData<{items:Product[];hasMore:boolean}>(path);
  const [extra,setExtra]=useState<Product[]>([]);
  const [page,setPage]=useState(2);
  const [more,setMore]=useState<boolean>();
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState('');
  async function loadMore() {
    setBusy(true);
    setFailure('');
    try {
      const next=await api<{items:Product[];hasMore:boolean}>(path+'?page='+page);
      setExtra(previous=>[...previous,...next.items]);
      setMore(next.hasMore);
      setPage(page+1);
    } catch(error){setFailure((error as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="product-section">
    <h2>{title}</h2>
    {error?<ErrorText message={error}/>:!data?<Loading/>:!data.items.length?<p>No recommendations available.</p>:
      <div className="grid product-recommendations">{[...data.items,...extra].map(item=><Card key={item.id} product={item}/>)}</div>}
    {failure&&<ErrorText message={failure}/>}
    {(more??data?.hasMore)&&<div className="load-recommendations"><button className="button secondary" disabled={busy} onClick={loadMore}>{busy?'Loading…':'Load more'}</button></div>}
  </section>;
}

function ProductReviews({slug}:{slug:string}) {
  const {user}=useMarket();
  const path='/products/'+encodeURIComponent(slug)+'/reviews';
  const {data,error}=useData<ReviewSummary>(path);
  const [current,setCurrent]=useState<ReviewSummary>();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState('');
  const [notice,setNotice]=useState('');
  const reviews=current??data;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const body=String(form.get('body')??'').trim();
    if([...body].length<10){
      setFailure('Write at least 10 characters.');
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      setCurrent(await api<ReviewSummary>(path,{rating:Number(form.get('rating')),body}));
      setOpen(false);
      setNotice('Your review was saved.');
    } catch(error){setFailure((error as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="product-section" id="reviews">
    <div className="section-heading"><h2>Reviews</h2>
      {user ? <button className="button secondary" aria-expanded={open} onClick={()=>{setOpen(!open);setNotice('');setFailure('');}}>{open?'Cancel':'Review now'}</button>
        : <Link className="button secondary" to={'/login?product='+encodeURIComponent(slug)}>Sign in to review</Link>}
    </div>
    <div className="product-panel review-summary">
      {error?<ErrorText message={error}/>:!reviews?<Loading/>:<>
        <div className="review-score"><Star size={21}/><strong>{reviews.average===null?'No ratings yet':reviews.average.toFixed(1)+' / 5'}</strong><span>{reviews.count} {reviews.count===1?'review':'reviews'}</span></div>
        {!reviews.count&&<p>Be the first to review this product.</p>}
        {reviews.count>reviews.items.length&&<small>Showing the {reviews.items.length} most recent reviews.</small>}
        {reviews.items.map(review=><article className="product-review" key={review.id}>
          <div><strong>{review.rating} / 5</strong><span>{new Date(review.updated_at).toLocaleDateString()}</span></div>
          <p>{review.body}</p>
        </article>)}
      </>}
      {notice&&<p role="status">{notice}</p>}
      {user&&open&&<form onSubmit={submit} className="review-form">
        <label>Rating<select name="rating" required defaultValue=""><option disabled value="">Select a rating</option>{[5,4,3,2,1].map(rating=><option key={rating} value={rating}>{rating} / 5</option>)}</select></label>
        <label>Your review<textarea name="body" rows={4} placeholder="Share your experience with this product…" required minLength={10} maxLength={1000}/></label>
        <small>Submitting again updates your review.</small>
        {failure&&<ErrorText message={failure}/>}
        <button className="button primary" disabled={busy}>{busy?'Saving…':'Save review'}</button>
      </form>}
    </div>
  </section>;
}

function ProductPage() {
  const {money}=useMarket();
  const {slug}=useParams();
  const {data,error}=useData<ProductDetail>('/products/'+encodeURIComponent(slug??''));
  const {cart,setCart,notice,setQuickOrder,recordView,preferences}=useMarket();
  const navigate=useNavigate();
  const [tab,setTab]=useState<'description'|'activation'>('description');
  useEffect(()=>setTab('description'),[slug]);
  useEffect(()=>{
    if(!data) return;
    recordView(data.slug);
    document.title=data.name+' | Eneba internship marketplace recreation';
    if(['#reviews','#seller-offers'].includes(window.location.hash)) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return ()=>{document.title='Eneba — Internship marketplace recreation';};
  },[data]);

  function purchase(p:Product,o:Offer,buyNow=false) {
    if (!o.stock) return;
    if (buyNow) {
      setQuickOrder({offer:o.id,quantity:1,name:p.name,seller:o.seller,cents:o.cents,slug:p.slug});
      navigate('/cart?mode=buy-now');
      return;
    }
    const existing=cart.find(i=>i.offer===o.id);
    if (existing && existing.quantity>=Math.min(o.stock,20)) {notice('You have reached the available quantity.'); return;}
    if (!existing&&cart.length>=20) {notice('Your cart can hold up to 20 offers.'); return;}
    const item={offer:o.id,quantity:(existing?.quantity||0)+1,name:p.name,seller:o.seller,cents:o.cents,slug:p.slug};
    setCart(existing ? cart.map(i=>i.offer===o.id?item:i) : [...cart,item]);
    navigate('/cart');
  }
  if (error) return <ErrorText message={error}/>;
  if (!data) return <Loading/>;
  const available=data.offers.filter(offer=>offer.stock>0);
  const featured=available[0];
  const others=available.slice(1);
  const soldOut=data.offers.filter(offer=>offer.stock===0);
  const attrs=data.attributes;
  function offerRow(offer:Offer) {
    return <article className="seller-row" key={offer.id} aria-label={offer.seller}>
      <div className="seller-identity"><span className="seller-avatar" aria-hidden="true">{offer.seller.slice(0,1).toUpperCase()}</span>
        <div><strong>{offer.seller}</strong><small>{offer.stock?`${offer.stock} available`:'Out of stock'}</small></div></div>
      <strong className="seller-price">{money(offer.cents)}</strong>
      <div className="seller-actions">
        <button className="button primary" disabled={!offer.stock} onClick={()=>purchase(data!,offer,true)}>Buy now</button>
        <button className="button secondary" disabled={!offer.stock} onClick={()=>purchase(data!,offer)}>Add to cart</button>
      </div>
    </article>;
  }
  const tabs=['description','activation'] as const;
  return <div className="inner product-page">
    <Breadcrumb><Link to="/store">Store</Link><span>/</span>{data.name}</Breadcrumb>
    <div className="product-columns">
      <section className="product-overview">
        <div className={'poster detail-art tone-'+data.id%6}><span className="poster-fallback">{data.name}</span><ProductArtwork product={data}/><span className="tag">{data.platform}</span></div>
        <div>
          <h1>{data.name}</h1>
          <p className="product-byline">{[attrs.edition,data.platform,data.region].filter(Boolean).join(' · ')}</p>
          <dl className="product-facts">
            <div><Globe size={19}/><dt>Activation region</dt><dd>{activationEligibility(data.region,attrs.country,preferences.country)}</dd></div>
            <div><Gamepad2 size={19}/><dt>Platform</dt><dd>{data.platform}</dd></div>
            <div><KeyRound size={19}/><dt>Digital delivery</dt><dd>Test key available in your order after payment.</dd></div>
            {attrs.os && <div><Monitor size={19}/><dt>Operating system</dt><dd>{attrs.os}</dd></div>}
          </dl>
          <a className="activation-link" href="#product-details" onClick={()=>setTab('activation')}>View activation guide <ArrowRight size={16}/></a>
        </div>
      </section>
      <aside className="featured-offer product-panel" aria-label="Featured offer">
        <h2>Featured offer</h2>
        {featured ? <>
          <p>Sold by <strong>{featured.seller}</strong></p>
          <strong className="featured-price">{money(featured.cents)}</strong>
          <button className="button primary" onClick={()=>purchase(data,featured,true)}>Buy now</button>
          <button className="button secondary" onClick={()=>purchase(data,featured)}>Add to cart</button>
          {others.length>0&&<a className="more-offers" href="#seller-offers">{others.length} more {others.length===1?'offer':'offers'} from {money(others[0].cents)} <ArrowRight size={16}/></a>}
          <small className="featured-payment"><ShieldCheck size={16}/> Test card or Eneba Wallet · No real charges</small>
        </> : <p>Out of stock. No seller has keys available right now.</p>}
      </aside>
      <section className="product-section offer-comparison" id="seller-offers">
        <h2>Seller offers</h2>
        {featured&&<><h3>Recommended offer</h3><p>Lowest available price.</p>{offerRow(featured)}</>}
        {others.length>0&&<><h3>Other available offers</h3>{others.map(offerRow)}</>}
        {soldOut.length>0&&<><h3>Sold-out offers</h3>{soldOut.map(offerRow)}</>}
        {!data.offers.length&&<p>No seller offers yet.</p>}
      </section>
    </div>
    <Recommendations key={data.slug} slug={data.slug}/>
    <ProductReviews key={data.slug} slug={data.slug}/>
    <section className="product-section" id="product-details">
      <h2>Product Details</h2>
      <div className="product-panel">
        <div className="product-tabs" role="tablist" aria-label="Product details">
          {tabs.map((id,index)=><button key={id} type="button" role="tab" id={'tab-'+id} aria-controls={'panel-'+id} aria-selected={tab===id} tabIndex={tab===id?0:-1}
            onClick={()=>setTab(id)} onKeyDown={event=>{
              const position=event.key==='Home'?0:event.key==='End'?1:['ArrowLeft','ArrowRight'].includes(event.key)?1-index:-1;
              if(position<0) return;
              event.preventDefault();
              const next=tabs[position];
              setTab(next);
              document.getElementById('tab-'+next)?.focus();
            }}>{id==='description'?'Description':'Activation guide'}</button>)}
        </div>
        <div className="tab-content" id={'panel-'+tab} role="tabpanel" aria-labelledby={'tab-'+tab} tabIndex={0}>
          {tab==='description'?<p>{data.description}</p>:<><h3>Activation on {data.platform}</h3><p>{data.activation}</p><p>Keys delivered by this internship recreation are test keys and cannot be redeemed.</p></>}
        </div>
      </div>
    </section>
    <section className="product-section">
      <h2>Other details</h2>
      <dl className="product-panel other-details">
        <div><dt>Release date</dt><dd>{data.release_date ? new Date(data.release_date+'T00:00:00Z').toLocaleDateString(undefined,{timeZone:'UTC',dateStyle:'medium'}) : 'Not listed'}</dd></div>
        <div><dt>Platform</dt><dd>{data.platform}</dd></div><div><dt>Region</dt><dd>{data.region}</dd></div>
        <div><dt>Category</dt><dd>{data.genre}</dd></div>
        {Object.entries(filterNames).filter(([key])=>attrs[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{attrs[key]}</dd></div>)}
      </dl>
    </section>
  </div>;
}

function Auth() {
  const [params]=useSearchParams();
  const {pathname}=useLocation();
  const register=pathname==='/register';
  const {setUser}=useMarket();
  const navigate=useNavigate();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const product=params.get('product');
  const destination=params.get('next');
  const next=product&&/^[a-z0-9-]{1,100}$/.test(product) ? '/product/'+encodeURIComponent(product)+'#reviews'
    : destination==='buy-now' ? '/checkout?mode=buy-now'
    : destination==='checkout' ? '/checkout' : destination==='cart' ? '/cart' : '/orders';
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');setBusy(true);
    try {
      setUser(await api<User>(register?'/register':'/login',{email,password}));
      navigate(next,{replace:true});
    } catch (err) {setError((err as Error).message);}
    finally {setBusy(false);}
  }
  return <section className="form-panel"><span className="mark"><KeyRound size={20}/></span><h1>{register?'Create account':'Sign in'}</h1>
    {error&&<ErrorText message={error}/>}
    <form onSubmit={submit}><label>Email<input type="email" name="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required maxLength={254}/></label>
      <label>Password<input type="password" name="password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete={register?'new-password':'current-password'}/></label>
      <button className="button primary" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
    </form>
    <p>{register?'Already registered?':'New to Eneba?'} <Link to={(register?'/login':'/register')+(product?'?product='+encodeURIComponent(product):next==='/orders'?'':'?next='+destination)}>{register?'Sign in':'Create an account'}</Link></p>
  </section>;
}

type CheckoutQuote = {cents:number;serviceFeeCents:number;discountCents:number; items:{offer:number;quantity:number;name:string|null;seller:string|null;cents:number|null;available:number;artwork:string|null;platform:string|null;region:string|null;country:string|null}[]};
type Scenario = 'test_card_approved' | 'test_card_declined' | 'test_wallet';
type PendingPayment = {basket:string;scenario:Scenario;cents:number;id:string};
type CardField = 'name' | 'number' | 'expiry' | 'cvc';
const testCards: Record<string,Scenario> = {'4242424242424242':'test_card_approved','0000000000000000':'test_card_declined'};

function digits(value:string, limit:number) {
  return value.replace(/\D/g,'').slice(0,limit);
}

function TestWallet({email,amount,switchToCard}:{email:string;amount:number|undefined;switchToCard:()=>void}) {
  const {money}=useMarket();
  const {data,error}=useData<{cents:number;topUpCents:number}>('/wallet');
  const [funded,setFunded]=useState<{cents:number;topUpCents:number}>();
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState('');
  const inFlight=useRef(false);
  const balance=funded??data;
  async function addFunds() {
    if(inFlight.current)return;
    inFlight.current=true;
    setBusy(true);
    setFailure('');
    const key='eneba.wallet-funding';
    const previous=saved<{email:string;id:string}|null>(key,null);
    const id=previous?.email===email?previous.id:crypto.randomUUID();
    try {
      localStorage.setItem(key,JSON.stringify({email,id}));
      setFunded(await api<{cents:number;topUpCents:number}>('/wallet/fund',{requestId:id}));
      localStorage.removeItem(key);
    } catch(err) {
      if(err instanceof RequestError&&err.status===409) localStorage.removeItem(key);
      setFailure((err as Error).message);
    } finally {
      inFlight.current=false;
      setBusy(false);
    }
  }
  return <div className="test-wallet">
    {error?<ErrorText message={error}/>:!balance?<Loading/>:<>
      <div><strong>Available test balance</strong><strong>{money(balance.cents)}</strong></div>
      <button type="button" className="button secondary" disabled={busy} onClick={addFunds}>{busy?'Adding funds…':'Add '+money(balance.topUpCents)+' in test funds'}</button>
      {amount!==undefined&&balance.cents<amount&&<p>Insufficient test balance. <button type="button" className="text-button" onClick={switchToCard}>Switch to card</button></p>}
      {failure&&<ErrorText message={failure}/>}
    </>}
  </div>;
}

function Cart({checkout=false}:{checkout?:boolean}) {
  const {money}=useMarket();
  const {cart:regularCart,setCart,user,sessionError,quickOrder,setQuickOrder,deliveryEmail,setDeliveryEmail,preferences,t}=useMarket();
  const [params]=useSearchParams();
  const quick=params.get('mode')==='buy-now';
  const cart=quick?(quickOrder?[quickOrder]:[]):regularCart;
  const signIn='/login?next='+(quick?'buy-now':'checkout');
  const cartPath=quick?'/cart?mode=buy-now':'/cart';
  const paymentPath=quick?'/checkout?mode=buy-now':'/checkout';
  const email=deliveryEmail??user?.email??'';
  const [method,setMethod]=useState<'card'|'wallet'>();
  function selectMethod(next:'card'|'wallet') {setMethod(next);setError('');}
  const [card,setCard]=useState({name:'',number:'',expiry:'',cvc:''});
  const [invalid,setInvalid]=useState<Partial<Record<CardField,string>>>({});
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const [error,setError]=useState('');
  const [quote,setQuote]=useState<CheckoutQuote>();
  const [quoteError,setQuoteError]=useState('');
  const [quoteVersion,refreshQuote]=useState(0);
  const navigate=useNavigate();
  const items=cart.map(({offer,quantity})=>({offer,quantity})).sort((a,b)=>a.offer-b.offer);
  const itemJSON=JSON.stringify(items);
  const basket=JSON.stringify({account:user?.email,deliveryEmail:email,items});
  const savedPayment=saved<PendingPayment|null>('keyshift.checkout',null);
  const pending=savedPayment?.basket===basket?savedPayment:null;
  const unavailable=quote?.items.some(i=>!i.name || i.available<i.quantity);
  const payable=pending?.cents ?? quote?.cents;
  useEffect(()=>{
    if (itemJSON==='[]') return;
    const controller=new AbortController();
    setQuote(undefined);
    setQuoteError('');
    api<CheckoutQuote>('/checkout/quote',{items:JSON.parse(itemJSON)},controller.signal)
      .then(setQuote).catch(err=>{
        if (!controller.signal.aborted) setQuoteError((err as Error).message);
      });
    return ()=>controller.abort();
  },[itemJSON,quoteVersion]);

  function quantity(offer:number,value:number) {
    if (!Number.isInteger(value) || value<1 || value>20) return;
    if(quick&&quickOrder) setQuickOrder({...quickOrder,quantity:value});
    else setCart(cart.map(i=>i.offer===offer?{...i,quantity:value}:i));
  }

  function update(field:CardField,value:string) {
    setCard(previous=>({...previous,[field]:value}));
    setInvalid(previous=>({...previous,[field]:undefined}));
    setError('');
  }

  async function buy(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !method || payable===undefined || (!pending && (!quote || unavailable))) return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){
      setError('Add a valid delivery email in the cart.');
      return;
    }
    const scenario=method==='wallet'?'test_wallet':testCards[digits(card.number,16)];
    if(method==='card'){
    const problems:Partial<Record<CardField,string>>={};
    if (!card.name.trim()) problems.name='Enter a cardholder name.';
    if (!scenario) problems.number='Use one of the card numbers in Test payment details.';
    const now=new Date();
    const [month,year]=card.expiry.split('/').map(Number);
    if (!/^\d{2}\/\d{2}$/.test(card.expiry) || month<1 || month>12 ||
        new Date(2000+year,month,1)<=now) problems.expiry='Enter an unexpired date in MM/YY format.';
    if (!/^\d{3}$/.test(card.cvc)) problems.cvc='Enter a three-digit test CVC.';
    setInvalid(problems);
    const first=Object.keys(problems)[0];
    if (first) {
      document.getElementById('test-card-'+first)?.focus();
      return;
    }
    }
    if (pending && pending.scenario!==scenario) {
      setError('The previous payment could not be confirmed. Retry with the same method and test details first.');
      return;
    }
    inFlight.current=true;
    setBusy(true);
    setError('');
    const id=pending?.id ?? crypto.randomUUID();
    try {
      localStorage.setItem('keyshift.checkout',JSON.stringify({basket,scenario,cents:payable,id}));
      const order=await api<{id:number}>('/checkout',{items,payment:scenario,expectedCents:payable,requestId:id,deliveryEmail:email.trim()});
      if(quick) setQuickOrder(null);
      else setCart([]);
      localStorage.removeItem('keyshift.checkout');
      navigate('/orders/'+order.id,{replace:true});
    } catch (err) {
      if (err instanceof RequestError && err.status===401) {
        navigate(signIn);
      } else {
        if (err instanceof RequestError && [400,402,409].includes(err.status)) {
          localStorage.removeItem('keyshift.checkout');
          if (err.status===409) refreshQuote(version=>version+1);
        }
        setError((err as Error).message);
      }
    } finally {
      inFlight.current=false;
      setBusy(false);
    }
  }

  const fieldError=(field:CardField)=>invalid[field] && <small className="field-error" id={'test-error-'+field}>{invalid[field]}</small>;
  const fieldProps=(field:CardField)=>({
    id:'test-card-'+field, autoComplete:'off', 'aria-invalid':Boolean(invalid[field]),
    'aria-describedby':invalid[field]?'test-error-'+field:undefined,
  });

  const methods=checkout&&user ? <form id="payment-form" className="payment-flow" onSubmit={buy} noValidate autoComplete="off">
    <fieldset disabled={busy}>
      <legend>{t('How would you like to pay?')}</legend>
      <label className="payment-method">
        <span className="payment-icon"><Wallet size={25}/></span>
        <span><strong>Eneba Wallet</strong><small>{t('Pay with your Eneba wallet balance.')}</small></span>
        <input name="method" type="radio" checked={method==='wallet'} onChange={()=>selectMethod('wallet')}/>
      </label>
      <label className="payment-method">
        <span className="payment-icon"><CreditCard size={25}/></span>
        <span><strong>{t('Credit or debit card')}</strong><small>{t('Pay with Visa or Mastercard.')}</small></span>
        <input name="method" type="radio" checked={method==='card'} onChange={()=>selectMethod('card')}/>
      </label>
      <div className="payment-panel">
        <span className="test-mode"><ShieldCheck size={16}/>{t('Test mode — no real charges')}</span>
        {method==='wallet'&&<TestWallet key={user.email} email={user.email} amount={payable} switchToCard={()=>selectMethod('card')}/>}
        {method==='card'&&<>
          <details className="payment-help"><summary>{t('Test payment details')}</summary>
            <dl><dt>Successful payment</dt><dd><code>4242 4242 4242 4242</code></dd><dt>Declined payment</dt><dd><code>0000 0000 0000 0000</code></dd></dl>
            <p>Use any test name, a future expiry date, and any three digits for CVC.</p>
          </details>
          <div className="card-inputs">
            <label>{t('Cardholder name')}<input {...fieldProps('name')} value={card.name} onChange={e=>update('name',e.target.value)} maxLength={80} placeholder="Cardholder name" required/>{fieldError('name')}</label>
            <label>{t('Card number')}<input {...fieldProps('number')} inputMode="numeric" value={card.number} onChange={e=>update('number',digits(e.target.value,16).match(/.{1,4}/g)?.join(' ')||'')} placeholder="0000 0000 0000 0000" required/>{fieldError('number')}</label>
            <div className="card-fields">
              <label>{t('Expiry date')}<input {...fieldProps('expiry')} inputMode="numeric" value={card.expiry} onChange={e=>{const value=digits(e.target.value,4);update('expiry',value.length>2?value.slice(0,2)+'/'+value.slice(2):value);}} placeholder="MM/YY" required/>{fieldError('expiry')}</label>
              <label>CVC<input {...fieldProps('cvc')} type="password" inputMode="numeric" value={card.cvc} onChange={e=>update('cvc',digits(e.target.value,3))} placeholder="•••" required/>{fieldError('cvc')}</label>
            </div>
          </div>
        </>}
        {error&&<ErrorText message={error}/>}
      </div>
    </fieldset>
  </form>:null;

  function lineItems(editable:boolean){
    return <ul className="checkout-lines">{cart.map(item=>{
      const current=quote?.items.find(line=>line.offer===item.offer);
      return <li key={item.offer}>
        <div className="checkout-thumbnail">{current?.artwork?<img src={current.artwork} alt=""/>:<Gift size={26}/>}</div>
        <div className="checkout-item-info">
          <small>Sold by <strong>{current?.seller??item.seller}</strong></small>
          <Link to={'/product/'+item.slug}><strong>{current?.name??item.name}</strong></Link>
          {current&&<small>{[current.platform,current.region].filter(Boolean).join(' · ')}</small>}
          {current?.region&&<small className="checkout-restriction">{activationEligibility(current.region,current.country??undefined,preferences.country)}</small>}
          {current && current.available<item.quantity&&<small className="field-error">{current.available} available</small>}
        </div>
        <div className="checkout-item-controls">
          {editable?<div className="quantity-stepper">
            <button aria-label={'Decrease quantity for '+item.name} disabled={item.quantity<=1} onClick={()=>quantity(item.offer,item.quantity-1)}>−</button>
            <output>{item.quantity}</output>
            <button aria-label={'Increase quantity for '+item.name} disabled={item.quantity>=Math.min(current?.available??20,20)} onClick={()=>quantity(item.offer,item.quantity+1)}>+</button>
          </div>:<small>Qty {item.quantity}</small>}
          <strong>{current?.cents==null?'—':money(current.cents*item.quantity)}</strong>
          {editable&&<button aria-label={'Remove '+item.name} className="text-button" onClick={()=>quick?setQuickOrder(null):setCart(cart.filter(x=>x.offer!==item.offer))}><Trash2 size={16}/></button>}
        </div>
      </li>;
    })}</ul>;
  }

  const summary=<aside className="checkout-sidebar">
    {!checkout&&<form id="delivery-form" className="checkout-box" onSubmit={event=>{
      event.preventDefault();
      if(!quote||unavailable) return;
      setDeliveryEmail(email);
      navigate(user?paymentPath:signIn);
    }}>
      <h2>{t('Where to deliver the order?')}</h2>
      <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event=>setDeliveryEmail(event.target.value)}/></label>
      <p>Purchased keys are available in your account after payment.</p>
    </form>}
    <section className="checkout-box">
      <h2>{t(checkout?'Order summary':'Summary')}</h2>
      {checkout&&lineItems(false)}
      {!checkout&&<button className="button primary" form="delivery-form" disabled={!quote||unavailable||user===undefined}>{t('Proceed to checkout')}</button>}
      <dl className="checkout-totals">
        <div><dt>{t('Subtotal')}</dt><dd>{quote?money(quote.cents-quote.serviceFeeCents+quote.discountCents):'—'}</dd></div>
        <div><dt>{t('Service fee')}</dt><dd>{quote?money(quote.serviceFeeCents):'—'}</dd></div>
        {Boolean(quote?.discountCents)&&<div><dt>Discount</dt><dd>−{money(quote!.discountCents)}</dd></div>}
        <div className="checkout-total"><dt>{t('Total')}</dt><dd>{payable===undefined?'—':money(payable)}</dd></div>
      </dl>
      {preferences.currency!=='EUR'&&payable!==undefined&&<p>Test total in EUR: {new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(payable/100)}. Displayed equivalents use fixed demo rates.</p>}
      {checkout&&<div className="checkout-email"><span>{t('Delivery email')}</span><strong>{email||'—'}</strong><Link to={cartPath}>{t('Edit')}</Link></div>}
      {checkout&&user&&<button form="payment-form" className="button primary pay-button" disabled={busy || !method || payable===undefined || (!pending&&unavailable)}>{busy?t('Processing…'):payable!==undefined?t('Pay')+' '+money(payable):t('Pay')}<ArrowRight size={18}/></button>}
      {pending&&checkout&&<p>A previous payment may still be pending. Retry with the same method and test details to check its outcome.</p>}
      {quoteError&&<><ErrorText message={quoteError}/><button className="button secondary" onClick={()=>refreshQuote(version=>version+1)}>Refresh total</button></>}
      {!pending&&!quoteError&&!quote&&<Loading/>}
      {!pending&&unavailable&&<ErrorText message="Some offers are unavailable. Update your cart before paying."/>}
    </section>
  </aside>;

  return <div className={'inner checkout-page '+(checkout?'payment-step':'cart-step')}>
    {!cart.length?<Empty title="Your cart is empty"><Link className="button primary" to="/store">Browse games<ArrowRight size={18}/></Link></Empty>:
      <>
        <div className="checkout-grid">
          <div className="checkout-main">
            {!checkout?<section className="checkout-box"><h1>{t('My cart')}</h1>{lineItems(true)}</section>:<>
              {sessionError&&<ErrorText message={sessionError}/>}
              {user===undefined?<Loading/>:user?methods:<section className="checkout-box"><h1>Sign in to continue</h1><Link className="button primary" to={signIn}>Sign in to checkout</Link></section>}
              <Link className="back-link" to={cartPath}><ArrowLeft size={16}/> {t('Back to cart')}</Link>
            </>}
          </div>
          {summary}
        </div>
        {!checkout&&<div className="checkout-picks"><Recommendations key={cart[0].slug} slug={cart[0].slug} title="Inspired by your picks"/></div>}
      </>}
  </div>;
}

function Orders() {
  const {money}=useMarket();
  const {setUser}=useMarket();
  const navigate=useNavigate();
  const [failure,setFailure]=useState('');
  const {data,error}=useData<Order[]>('/orders');
  async function signOut() {
    try {await api('/logout',{});setUser(null);navigate('/');}
    catch (err) {setFailure((err as Error).message);}
  }
  return <div className="inner"><Breadcrumb>Orders</Breadcrumb>
    <div className="section-heading"><h1>Order history</h1><button className="button secondary" onClick={signOut}>Sign out</button></div>
    {failure && <ErrorText message={failure}/>}
    {error?<ErrorText message={error}/>:!data?<Loading/>:!data.length?<Empty title="No orders yet"><Link className="button primary" to="/store">Browse games</Link></Empty>:
      <div className="order-list">{data.map(o=><Link className="offer" key={o.id} to={'/orders/'+o.id}><div><strong>Order #{o.id}</strong><small>{new Date(o.created_at).toLocaleDateString()}</small></div><strong>{money(o.cents)}</strong><ArrowUpRight size={18}/></Link>)}</div>}
  </div>;
}

function ReceivedKey({code,index}:{code:string;index:number}) {
  const [revealed,setRevealed]=useState(false);
  const [copy,setCopy]=useState('');
  async function copyKey() {
    try {await navigator.clipboard.writeText(code);setCopy('Key copied.');}
    catch {setCopy('Clipboard unavailable. Select and copy the key.');}
  }
  return <div className="key-entry">
    <div><small>Key {index+1}</small><code>{revealed?code:'•••• •••• •••• ••••'}</code></div>
    <div className="actions">
      <button className="button secondary" aria-pressed={revealed} onClick={()=>{setRevealed(!revealed);setCopy('');}}>{revealed?'Hide':'Reveal'}</button>
      <button className="button secondary" disabled={!revealed} onClick={copyKey}>Copy</button>
    </div>
    {copy && <small role="status">{copy}</small>}
  </div>;
}

function OrderPage() {
  const {money,t}=useMarket();
  const {id}=useParams();
  const {data,error}=useData<OrderDetail>('/orders/'+id);
  if (error) return <ErrorText message={error}/>;
  if (!data) return <Loading/>;
  return <div className="inner receipt">
    <Breadcrumb><Link to="/orders">Orders</Link><span>/</span>#{data.id}</Breadcrumb>
    <div className="receipt-header"><span className="receipt-check"><Check size={22}/></span><div><h1>{t('Payment successful')}</h1><p>Order #{data.id} · {new Date(data.created_at).toLocaleDateString()} · {data.payment_method==='wallet'?'Eneba Wallet':'Credit or debit card'}</p></div><strong>{money(data.cents)}</strong></div>
    <h2 className="receipt-title">Receipt summary</h2>
    {data.items.map(i=><article className="key-card" key={i.id}>
      <div className="receipt-item">
        {i.artwork ? <img src={i.artwork} alt=""/> : <span className="receipt-item-icon"><Gift size={22}/></span>}
        <div><h3>{i.product}</h3><p>{i.platform} · {i.region}</p><small>{i.seller} · Qty {i.quantity} · {money(i.cents)} each</small></div>
        <strong>{money(i.cents*i.quantity)}</strong>
      </div>
      <div className="key-panel">
        <div className="key-heading"><h3><KeyRound size={17}/> Digital keys</h3><span className="test-mode">Test key — cannot be redeemed</span></div>
        {i.keys.map((code,index)=><ReceivedKey key={index} code={code} index={index}/>)}
        {i.activation && <details><summary>How to activate on {i.platform}</summary><p>{i.activation}</p></details>}
      </div>
    </article>)}
    <div className="actions receipt-actions"><Link className="button secondary" to="/orders">{t('View orders')}</Link><Link className="button primary" to="/store">{t('Continue shopping')}<ArrowRight size={18}/></Link></div>
  </div>;
}

function Protected({children}:{children:ReactNode}) {
  const {user,sessionError}=useMarket();
  if (sessionError) return <><ErrorText message={sessionError}/><Empty title="Sign in to view your orders"><Link className="button primary" to="/login">Sign in</Link></Empty></>;
  if (user===undefined) return <Loading/>;
  if (!user) return <Empty title="Sign in to view your orders"><Link className="button primary" to="/login">Sign in</Link></Empty>;
  return children;
}

function CheckoutHeader({step,quick}:{step:number;quick:boolean}) {
  const {t}=useMarket();
  const steps=['Cart','Payment','Get your product'];
  return <header className="checkout-header"><div className="wrap">
    <Brand/>
    <ol className="checkout-progress" aria-label="Checkout progress">
      {steps.map((label,index)=><li key={label} data-state={index+1<step?'done':index+1===step?'active':'upcoming'} aria-current={index+1===step?'step':undefined}>
        <span aria-hidden="true">{index+1<step?<Check size={14}/>:index+1}</span>
        {step===2&&index===0?<Link to={quick?'/cart?mode=buy-now':'/cart'}>{t(label)}</Link>:<strong>{t(label)}</strong>}
      </li>)}
    </ol>
    <SettingsControl/>
  </div></header>;
}

const footerGroups=[
  {title:'About Eneba',links:[['Official Eneba website','https://www.eneba.com/'],['About this recreation','/help#about']]},
  {title:'Buy',links:[['How to buy','/help#buy'],['Collections','/store?collection=top-games'],['Cheap games','/store/cheap-games']]},
  {title:'Help',links:[['FAQ','/help'],['How to activate a game','/help#activation'],['Test payments','/help#payments']]},
  {title:'Community',links:[['Gift Guide','/store/gift-guide'],['Your wishlist','/wishlist']]},
  {title:'Business',links:[['About seller offers','/help#sellers'],['Source repository','https://github.com/Nisha-gpt/eneba']]},
  {title:'Follow us',links:[['Eneba on Instagram','https://www.instagram.com/eneba_games/'],['Project on GitHub','https://github.com/Nisha-gpt/eneba']]},
];

function PaymentStrip() {
  return <div className="payment-strip"><div className="wrap"><span><Wallet size={19}/> Eneba Wallet</span><span><CreditCard size={19}/> Credit or debit card</span></div></div>;
}

function Footer({showPayments}:{showPayments:boolean}) {
  const [message,setMessage]=useState('');
  const [failure,setFailure]=useState('');
  const [submitting,setSubmitting]=useState(false);
  async function subscribe(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    setMessage('');setFailure('');setSubmitting(true);
    try{
      await api('/newsletter',{email:new FormData(form).get('email')});
      form.reset();
      setMessage('Your demo newsletter preference was saved.');
    }catch(err){setFailure((err as Error).message);}
    finally{setSubmitting(false);}
  }
  return <>
    {showPayments&&<PaymentStrip/>}
    <footer className="site-footer"><div className="wrap">
      <div className="footer-columns">
        {footerGroups.map(group=><div key={group.title}><h2>{group.title}</h2>{group.links.map(([label,destination])=>
          destination.startsWith('https:')?<a key={label} href={destination} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={12}/><span className="sr-only"> (external)</span></a>
          : <Link key={label} to={destination}>{label}</Link>)}</div>)}
        <div><h2>Explore the demo</h2><Link to="/store">Browse the marketplace</Link><Link to="/orders">View orders</Link></div>
        <div><h2>Product reviews</h2><Link to="/product/elden-ring#reviews">Read or write a review</Link></div>
      </div>
      <div className="footer-lower">
        <div><h2>Get personalized game deals</h2>
          <form onSubmit={subscribe} className="newsletter">
            <input type="email" name="email" aria-label="Newsletter email" placeholder="Enter your email" required maxLength={254}/>
            <button className="button secondary" disabled={submitting}>{submitting?'Saving…':'Subscribe'}</button>
          </form>
          <small>Demo subscription only. No emails are sent.</small>
          {message&&<p role="status">{message}</p>}
          {failure&&<ErrorText message={failure}/>}
        </div>
        <SettingsControl/>
      </div>
      <p className="footer-note">Unofficial Eneba internship recreation · Simulated payments and non-redeemable test keys</p>
    </div></footer>
  </>;
}

function Help() {
  const {hash}=useLocation();
  useEffect(()=>{if(hash)document.getElementById(hash.slice(1))?.scrollIntoView();},[hash]);
  return <div className="inner help-page">
    <h1>Marketplace help</h1>
    <section id="about"><h2>About this recreation</h2><p>An unofficial marketplace built for the Eneba internship assignment.</p></section>
    <section id="buy"><h2>How to buy</h2><p>Choose an in-stock seller offer, review your cart, and sign in before choosing a payment method.</p><Link to="/store">Browse the store</Link></section>
    <section id="activation"><h2>How to activate a game</h2><p>Open the Activation guide on a product page for the platform’s instructions. Your order history contains the non-redeemable test key.</p></section>
    <section id="payments"><h2>Test payments</h2><p>Checkout supports a test card and Eneba Wallet test funds. Keys are available from your account after checkout.</p></section>
    <section id="sellers"><h2>About seller offers</h2><p>Choose the seller at checkout by selecting its offer on the product page. The displayed price comes from available inventory for that offer.</p></section>
  </div>;
}

function App() {
  const [preferences,setPreferences]=useState(()=>saved<Preferences>('eneba.preferences',defaultPreferences));
  const [settings,setSettings]=useState(false);
  const [settingsMessage,setSettingsMessage]=useState('');
  const [history,setHistory]=useState(()=>saved<string[]>('eneba.history',[]));
  const navigation=useData<Category[]>('/navigation');
  const t=(text:string)=>preferences.language==='es'?translations[text]??text:text;
  const formatter=useMemo(()=>new Intl.NumberFormat(preferences.language==='es'?'es-ES':'en-IE',{style:'currency',currency:preferences.currency}),[preferences.language,preferences.currency]);
  const money=(cents:number)=>formatter.format(cents*currencyRates[preferences.currency]/100);
  function recordView(slug:string){
    setHistory(previous=>{
      if(previous[0]===slug)return previous;
      const next=[slug,...previous.filter(item=>item!==slug)].slice(0,12);
      localStorage.setItem('eneba.history',JSON.stringify(next));
      return next;
    });
  }
  useEffect(()=>{document.documentElement.lang=preferences.language;},[preferences.language]);

  const [deliveryEmail,updateDeliveryEmail]=useState<string|null>(()=>sessionStorage.getItem('eneba.delivery-email'));
  function setDeliveryEmail(email:string){
    sessionStorage.setItem('eneba.delivery-email',email);
    updateDeliveryEmail(email);
  }
  const [cart,updateCart]=useState(()=>saved<Item[]>('keyshift.cart',[]));
  const [quickOrder,updateQuickOrder]=useState<Item|null>(()=>{
    try {return JSON.parse(sessionStorage.getItem('eneba.buy-now')??'null');}
    catch {return null;}
  });
  function setQuickOrder(item:Item|null){
    if(item) sessionStorage.setItem('eneba.buy-now',JSON.stringify(item));
    else sessionStorage.removeItem('eneba.buy-now');
    updateQuickOrder(item);
  }
  const [wishlist,setWishlist]=useState(()=>saved<string[]>('eneba.wishlist',[]));
  function toggleWishlist(slug:string) {
    const next=wishlist.includes(slug)?wishlist.filter(item=>item!==slug):[...wishlist,slug];
    localStorage.setItem('eneba.wishlist',JSON.stringify(next));
    setWishlist(next);
  }
  const [session,setSession]=useState<{user?:User|null; error:string}>({error:''});
  const {user,error:sessionError}=session;
  function setUser(next:User|null) {
    setSession({user:next,error:''});
  }
  const [toast,setToast]=useState('');
  const {pathname,search}=useLocation();
  const step=pathname==='/cart'?1:pathname==='/checkout'?2:/^\/orders\/[^/]+$/.test(pathname)?3:0;
  const quick=new URLSearchParams(search).get('mode')==='buy-now';
  useEffect(() => {
    const request = new AbortController();
    function finish(next:typeof session) {
      if (!request.signal.aborted) setSession(current => current.user === undefined ? next : current);
    }
    api<User|null>('/session', undefined, request.signal)
      .then(user => finish({user,error:''}))
      .catch(error => finish({user:null,error:error.message}));
    return () => request.abort();
  }, []);
  useEffect(()=>{if(!window.location.hash)window.scrollTo(0,0);},[pathname]);
  useEffect(()=>{if (!toast) return;const timer=setTimeout(()=>setToast(''),3000);return ()=>clearTimeout(timer);},[toast]);
  function setCart(items:Item[]) {localStorage.setItem('keyshift.cart',JSON.stringify(items));updateCart(items);}
  return <MarketContext.Provider value={{cart,setCart,user,setUser,sessionError,notice:setToast,wishlist,toggleWishlist,quickOrder,setQuickOrder,deliveryEmail,setDeliveryEmail,preferences,t,money,openSettings:()=>setSettings(true),navigation,history,recordView}}>
    {step?<CheckoutHeader step={step} quick={quick}/>:<Header/>}
    <main className="wrap"><Routes>
      <Route path="/" element={<Home/>}/><Route path="/store" element={<Store/>}/><Route path="/store/:category" element={<Store/>}/><Route path="/wishlist" element={<Wishlist/>}/><Route path="/help" element={<Help/>}/><Route path="/product/:slug" element={<ProductPage/>}/>
      <Route path="/cart" element={<Cart key="cart"/>}/><Route path="/checkout" element={<Cart key="checkout" checkout/>}/><Route path="/login" element={<Auth key="login"/>}/><Route path="/register" element={<Auth key="register"/>}/>
      <Route path="/orders" element={<Protected><Orders/></Protected>}/><Route path="/orders/:id" element={<Protected><OrderPage/></Protected>}/>
      <Route path="*" element={<Empty title="Page not found"><Link to="/">Return home</Link></Empty>}/>
    </Routes></main>
    <Footer showPayments={pathname==='/'}/>
    {settings&&<SettingsDialog preferences={preferences} onClose={()=>setSettings(false)} onSave={value=>{
      localStorage.setItem('eneba.preferences',JSON.stringify(value));
      setPreferences(value);setSettings(false);
      setSettingsMessage(value.language==='es'?'Preferencias guardadas.':'Settings saved.');
    }}/>}
    {settingsMessage&&<div className="toast" role="status"><Check size={17}/>{settingsMessage}<button className="text-button" aria-label={t('Close')} onClick={()=>setSettingsMessage('')}><X size={16}/></button></div>}
    {toast && <div className="toast" role="status"><ShoppingCart size={17}/>{toast} <Link to="/cart">View cart</Link></div>}
  </MarketContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
