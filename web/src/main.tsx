import { useEffect, useState, useRef, createContext, useContext } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleUserRound, Gamepad2, KeyRound, Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Monitor, Joystick, Gamepad, Menu, X, ChevronLeft, ChevronRight, Globe, Heart, Gift } from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import './style.css';

type Product = {id:number; slug:string; name:string; platform:string; region:string; genre:string; description:string; activation:string; artwork:string; attributes:Record<string,string>; cents:number|null};
type Offer = {id:number; seller:string; cents:number; stock:number};
type Item = {offer:number; quantity:number; name:string; seller:string; cents:number; slug:string};
type User = {email:string};
type Order = {id:number; cents:number; created_at:string};
type OrderDetail = Order & {items:{id:number; product:string; seller:string; cents:number; quantity:number; keys:string[]; artwork:string; platform:string; region:string; activation:string}[]};
type Banner = {eyebrow:string; headline:string; subtitle:string; action:string; destination:string; artwork:string};

const money = (cents:number) => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);

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

type Market = {wishlist:string[]; toggleWishlist:(slug:string)=>void; cart:Item[]; setCart:(items:Item[])=>void; user:User|null|undefined; setUser:(u:User|null)=>void; sessionError:string; notice:(s:string)=>void};
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
    <span className="eneba-mark" aria-hidden="true"><i/><i/><i/></span><span>eneba</span>
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
    heading={!parent?<span className="brand" aria-hidden="true"><span className="eneba-mark"><i/><i/><i/></span><span>eneba</span></span>:undefined}
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
  const {cart,user,wishlist} = useMarket();
  const navigate = useNavigate();
  const {pathname,search} = useLocation();
  const query = pathname.startsWith('/store') ? new URLSearchParams(search).get('q') ?? '' : '';
  const [value,setValue] = useState(query);
  const [drawer,setDrawer]=useState(false);
  const navigation=useData<Category[]>('/navigation');
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
        <Search size={22}/><input aria-label="Search games" placeholder="Search for games, top-ups and more" value={value} onChange={e=>setValue(e.target.value)} maxLength={100}/>
        <button aria-label="Submit search"><ArrowRight size={17}/></button>
      </form>
      <div className="utilities">
        <details className="locale-control"><summary aria-label="Language and currency"><Globe size={18}/><span>English | EUR</span></summary>
          <div><strong>English · EUR</strong><p>The storefront is available in English. Purchases are quoted in EUR.</p></div>
        </details>
        <Link className="icon-link" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`}><Heart size={22}/>{wishlist.length>0&&<b>{wishlist.length}</b>}</Link>
        <Link className="bag" to="/cart" aria-label={`Cart, ${cart.reduce((sum,i)=>sum+i.quantity,0)} items`}><ShoppingCart size={22}/><b>{cart.reduce((sum,i)=>sum+i.quantity,0)}</b></Link>
        <Link to={user ? '/orders' : '/login'} aria-label={user ? 'Your orders' : 'Sign in'}><CircleUserRound size={22}/><span>{user ? 'Orders' : 'Log in'}</span></Link>
        {!user&&<Link className="register-nav" to="/register">Register</Link>}
      </div>
    </div>
    <div className="market-nav"><nav className="wrap" aria-label="Marketplace">
      <button onClick={()=>setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer}><Menu size={20}/> Categories</button>
      {links.map(c=><NavLink key={c.slug} to={categoryPath(c.slug)}>{c.name}</NavLink>)}
      {navigation.data?.some(c=>c.slug==='gift-guide')&&<NavLink to="/store/gift-guide">Gift Guide</NavLink>}
    </nav></div>
    {drawer&&<CategoryDrawer categories={navigation.data??[]} error={navigation.error} onClose={()=>setDrawer(false)}/>}
  </header>;
}

function ProductArtwork({product}:{product:Product}) {
  if(product.artwork) return <img src={product.artwork} alt="" loading="lazy" onError={e=>e.currentTarget.hidden=true}/>;
  return <div className={'catalog-art art-'+(product.attributes.tone??'violet')} aria-hidden="true">
    <div>{product.attributes.type==='Software'?<Monitor size={40}/>:<Gift size={40}/>}<strong>{product.attributes.brand??product.platform}</strong>
      <span>{product.attributes.denomination ? product.attributes.denomination+' '+product.attributes.currency : product.attributes.type}</span></div>
  </div>;
}

function Card({product}:{product:Product}) {
  const {wishlist,toggleWishlist}=useMarket();
  const saved=wishlist.includes(product.slug);
  return <article className="card-shell">
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

function Collection({path}:{path:string}) {
  const {data,error} = useData<{title:string;label:string;browse_path:string;items:Product[]}>('/home/'+path);
  return <section className="collection">
    {error ? <ErrorText message={error}/> : !data ? <Loading/> : <>
      <div className="section-heading"><div><h2>{data.title}</h2></div><Link to={data.browse_path}>Browse store <ArrowUpRight size={17}/></Link></div>
      {data.items.length ? <div className="grid">{data.items.map(p=><Card key={p.id} product={p}/>)}</div> : <Empty title="No products in this collection"/>}
    </>}
  </section>;
}

function Home() {
  const {data,error}=useData<Banner>('/home/banner');
  return <>
    <section className="hero">
      {error ? <ErrorText message={error}/> : !data ? <Loading/> : <>
        <img className="hero-art" src={data.artwork} alt="" fetchPriority="high" onError={e=>e.currentTarget.hidden=true}/>
        <div className="hero-content">
          <div className="eyebrow hero-tag"><span/>{data.eyebrow}</div>
          <h1>{data.headline}</h1><p>{data.subtitle}</p>
          <Link className="button primary" to={data.destination}>{data.action}<ArrowRight size={19}/></Link>
        </div>
      </>}
    </section>
    <nav className="home-platforms" id="market" aria-label="Browse games by platform">
      {marketplaceLinks.filter(link=>link.name!=='Cheap Games').map(link=><Link key={link.path} to={link.path}><link.icon size={24}/>{link.name}</Link>)}
    </nav>
    <Collection path="bestsellers"/>
    <Collection path="deals"/>
  </>;
}

const filterNames:Record<string,string> = {
  country:'Country',type:'Type',os:'Operating system',platform:'Platforms',
  brand:'Brand',region:'Region',currency:'Currency',denomination:'Denomination',
};
type FacetOption={value:string;count:number};
type Listing={items:Product[];total:number;pageSize:number;category:Category|null;facets:Record<string,FacetOption[]>};

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
  const [error,setError]=useState('');
  function apply(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const limits=['min','max'].map(key=>String(data.get(key)??'').trim());
    if(limits.some(value=>value&&!/^\d{1,5}(?:\.\d{1,2})?$/.test(value.replace(',','.')))){
      setError('Enter a price with up to two decimals.');
      return;
    }
    const [low,high]=limits.map(value=>value?String(Math.round(Number(value.replace(',','.'))*100)):'');
    if((high&&Number(low)>Number(high))||limits.some(value=>Number(value.replace(',','.'))>10000)){
      setError('Enter a valid range up to €10,000.');
      return;
    }
    onApply(low,high);
  }
  return <details className="facet price-range" open>
    <summary>Price range (EUR)</summary>
    <form onSubmit={apply}>
      <div><input name="min" inputMode="decimal" aria-label="Minimum price" placeholder="Min" defaultValue={min?Number(min)/100:''}/>
      <span>–</span><input name="max" inputMode="decimal" aria-label="Maximum price" placeholder="Max" defaultValue={max?Number(max)/100:''}/></div>
      {error&&<ErrorText message={error}/>}
      <button className="button secondary">Apply price</button>
    </form>
  </details>;
}

function Store() {
  const {category}=useParams();
  const [params,setParams] = useSearchParams();
  const [filterDrawer,setFilterDrawer]=useState(false);
  const request=new URLSearchParams(params);
  if(category) request.set('category',category);
  else request.delete('category');
  const {data,error,previous} = useData<Listing>('/products?'+request);
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
    <PriceRange key={min+':'+max} min={min} max={max} onApply={(low,high)=>{
      const next=new URLSearchParams(params);
      if(low) next.set('min',low);else next.delete('min');
      if(high) next.set('max',high);else next.delete('max');
      next.delete('page');setParams(next);
    }}/>
    {Object.entries(filterNames).filter(([key])=>facets?.[key]?.length||params.has(key)).map(([key,label])=>
      <Facet key={(category??'')+key} name={label} options={facets?.[key]??[]} selected={params.getAll(key)} change={value=>toggle(key,value)}/>)}
  </>;
  return <div className="inner catalog-page">
    <h1>{query ? `Results for “${query}”` : data?.category?.heading ?? (category?'Browse category':'All offers')}</h1>
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

function ProductPage() {
  const {slug}=useParams();
  const {data,error}=useData<Product & {offers:Offer[]}>('/products/'+slug);
  const {cart,setCart,notice}=useMarket();
  function add(p:Product,o:Offer) {
    const existing=cart.find(i=>i.offer===o.id);
    if (existing && existing.quantity>=Math.min(o.stock,20)) {notice('You have reached the available quantity.'); return;}
    const item={offer:o.id,quantity:(existing?.quantity||0)+1,name:p.name,seller:o.seller,cents:o.cents,slug:p.slug};
    setCart(existing ? cart.map(i=>i.offer===o.id?item:i) : [...cart,item]);
    notice(`${p.name} added to your cart.`);
  }
  if (error) return <ErrorText message={error}/>;
  if (!data) return <Loading/>;
  return <div className="inner"><Breadcrumb><Link to="/store">Store</Link><span>/</span>{data.name}</Breadcrumb>
    <div className="product-layout">
      <div className={'poster detail-art tone-'+data.id%6}><span className="poster-fallback">{data.name}</span><ProductArtwork product={data}/></div>
      <div><div className="eyebrow section-kicker">{data.genre}</div><h1>{data.name}</h1>
        <div className="pills"><span><Gamepad2 size={17}/>{data.platform}</span><span>{data.region}</span><span><KeyRound size={16}/>Digital key</span></div>
        <p className="description">{data.description}</p>
        {Object.keys(data.attributes).length>0&&<dl className="product-attributes">
          {Object.entries(filterNames).filter(([key])=>data.attributes[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{data.attributes[key]}</dd></div>)}
        </dl>}<details><summary>Activation information</summary><p>{data.activation} This demo provides sample keys only.</p></details>
        <h2 className="offer-title">Seller offers</h2>
        {data.offers.map(o=><div className="offer" key={o.id}><div><strong>{o.seller}</strong><small>{o.stock ? `${o.stock} available` : 'Out of stock'}</small></div><strong>{money(o.cents)}</strong><button className="button primary" disabled={!o.stock} onClick={()=>add(data,o)}>Add to cart</button></div>)}
      </div>
    </div>
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
  const next=params.get('next')==='checkout' ? '/checkout' : params.get('next')==='cart' ? '/cart' : '/orders';
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
    <p>{register?'Already registered?':'New to Eneba?'} <Link to={(register?'/login':'/register')+(next==='/orders'?'':'?next='+next.slice(1))}>{register?'Sign in':'Create an account'}</Link></p>
  </section>;
}

type CheckoutQuote = {cents:number; items:{offer:number;quantity:number;name:string|null;seller:string|null;cents:number|null;available:number}[]};
type Scenario = 'test_card_approved' | 'test_card_declined';
type PendingPayment = {basket:string;scenario:Scenario;cents:number;id:string};
type CardField = 'name' | 'number' | 'expiry' | 'cvc';
const testCards: Record<string,Scenario> = {'4242424242424242':'test_card_approved','0000000000000000':'test_card_declined'};

function digits(value:string, limit:number) {
  return value.replace(/\D/g,'').slice(0,limit);
}

function Cart({checkout=false}:{checkout?:boolean}) {
  const {cart,setCart,user,sessionError}=useMarket();
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
  const basket=JSON.stringify({email:user?.email,items});
  const savedPayment=saved<PendingPayment|null>('keyshift.checkout',null);
  const pending=savedPayment?.basket===basket?savedPayment:null;
  const total=cart.reduce((sum,i)=>sum+i.quantity*i.cents,0);
  const unavailable=quote?.items.some(i=>!i.name || i.available<i.quantity);
  const payable=pending?.cents ?? quote?.cents;
  useEffect(()=>{
    if (!checkout || !user || itemJSON==='[]') return;
    const controller=new AbortController();
    setQuote(undefined);
    setQuoteError('');
    api<CheckoutQuote>('/checkout/quote',{items:JSON.parse(itemJSON)},controller.signal)
      .then(setQuote).catch(err=>{
        if (!controller.signal.aborted) setQuoteError((err as Error).message);
      });
    return ()=>controller.abort();
  },[checkout,user,itemJSON,quoteVersion]);

  function quantity(offer:number,value:number) {
    if (!Number.isInteger(value) || value<1 || value>20) return;
    setCart(cart.map(i=>i.offer===offer?{...i,quantity:value}:i));
  }

  function update(field:CardField,value:string) {
    setCard(previous=>({...previous,[field]:value}));
    setInvalid(previous=>({...previous,[field]:undefined}));
    setError('');
  }

  async function buy(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || payable===undefined || (!pending && (!quote || unavailable))) return;
    const problems:Partial<Record<CardField,string>>={};
    const scenario=testCards[digits(card.number,16)];
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
    if (pending && pending.scenario!==scenario) {
      setError('The previous payment could not be confirmed. Retry with the same test card first.');
      return;
    }
    inFlight.current=true;
    setBusy(true);
    setError('');
    const id=pending?.id ?? crypto.randomUUID();
    try {
      localStorage.setItem('keyshift.checkout',JSON.stringify({basket,scenario,cents:payable,id}));
      const order=await api<{id:number}>('/checkout',{items,payment:scenario,expectedCents:payable,requestId:id});
      setCart([]);
      localStorage.removeItem('keyshift.checkout');
      navigate('/orders/'+order.id,{replace:true});
    } catch (err) {
      if (err instanceof RequestError && err.status===401) {
        navigate('/login?next=checkout');
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

  return <div className="inner"><Breadcrumb>{checkout?<><Link to="/cart">Cart</Link><span>/</span>Checkout</>:'Cart'}</Breadcrumb>
    <h1>{checkout?'Checkout':'Your cart'}</h1>
    {!cart.length ? <Empty title="Your cart is empty"><Link className="button primary" to="/store">Browse games<ArrowRight size={18}/></Link></Empty> :
      <div className="cart-layout">
        {checkout ? <div>
          {sessionError && <ErrorText message={sessionError}/>}
          {user===undefined ? <Loading/> : !user ? <div className="summary"><h2>Sign in to continue</h2><Link className="button primary" to="/login?next=checkout">Sign in to checkout</Link></div> :
          <form className="payment-panel" onSubmit={buy} noValidate autoComplete="off">
            <div className="payment-heading"><h2>Card payment</h2><span className="test-mode"><ShieldCheck size={16}/>Test mode — no real charges</span></div>
            <details className="payment-help"><summary>Test payment details</summary>
              <dl><dt>Successful payment</dt><dd><code>4242 4242 4242 4242</code></dd><dt>Declined payment</dt><dd><code>0000 0000 0000 0000</code></dd></dl>
              <p>Use any test name, a future expiry date, and any three digits for CVC.</p>
            </details>
            {error && <ErrorText message={error}/>}
            <fieldset disabled={busy}>
              <label>Cardholder name<input {...fieldProps('name')} value={card.name} onChange={e=>update('name',e.target.value)} maxLength={80} placeholder="Cardholder name" required/>{fieldError('name')}</label>
              <label>Card number<input {...fieldProps('number')} inputMode="numeric" value={card.number} onChange={e=>update('number',digits(e.target.value,16).match(/.{1,4}/g)?.join(' ')||'')} placeholder="0000 0000 0000 0000" required/>{fieldError('number')}</label>
              <div className="card-fields">
                <label>Expiry date<input {...fieldProps('expiry')} inputMode="numeric" value={card.expiry} onChange={e=>{const value=digits(e.target.value,4);update('expiry',value.length>2?value.slice(0,2)+'/'+value.slice(2):value);}} placeholder="MM/YY" required/>{fieldError('expiry')}</label>
                <label>CVC<input {...fieldProps('cvc')} type="password" inputMode="numeric" value={card.cvc} onChange={e=>update('cvc',digits(e.target.value,3))} placeholder="•••" required/>{fieldError('cvc')}</label>
              </div>
              <button className="button primary" disabled={payable===undefined || (!pending && unavailable)}>{busy?'Processing…':payable!==undefined?'Pay '+money(payable):'Pay'}<ArrowRight size={18}/></button>
            </fieldset>
          </form>}
          <Link className="back-link" to="/cart"><ArrowLeft size={16}/> Back to cart</Link>
        </div> : <div className="cart-items">{cart.map(i=><div className="cart-row" key={i.offer}>
          <div><Link to={'/product/'+i.slug}><strong>{i.name}</strong></Link><small>{i.seller} · {money(i.cents)} each</small></div>
          <label>Qty<input aria-label={i.name+' quantity'} type="number" min={1} max={20} value={i.quantity} onChange={e=>quantity(i.offer,e.target.valueAsNumber)}/></label>
          <button className="text-button" onClick={()=>setCart(cart.filter(x=>x.offer!==i.offer))}>Remove</button>
        </div>)}</div>}
        <aside className="summary"><h2>Order summary</h2>
          <ul className="receipt-lines">{cart.map(i=>{
            const current=quote?.items.find(line=>line.offer===i.offer);
            const unitPrice=checkout&&user?current?.cents:i.cents;
            return <li key={i.offer}>
              <div><strong>{current?.name??i.name}</strong><small>{current?.seller??i.seller} · Qty {i.quantity}</small>
                {current && current.available<i.quantity && <small className="field-error">{current.available} available</small>}</div>
              <strong>{unitPrice==null?'—':money(unitPrice*i.quantity)}</strong>
            </li>;
          })}</ul>
          <div className="sum"><span>{checkout?'Total':'Estimated total'}</span><strong>{checkout && user ? payable===undefined?'—':money(payable):money(total)}</strong></div>
          {checkout && user && <>
            {pending && <p>A previous payment may still be pending. Retry with the same test card to check its outcome.</p>}
            {quoteError && <><ErrorText message={quoteError}/><button className="button secondary" onClick={()=>refreshQuote(version=>version+1)}>Refresh total</button></>}
            {!pending && !quoteError && !quote && <Loading/>}
            {!pending && unavailable && <ErrorText message="Some offers are unavailable. Update your cart before paying."/>}
          </>}
          {!checkout && <Link className="button primary" to="/checkout">Continue to checkout<ArrowRight size={18}/></Link>}
        </aside>
      </div>}
  </div>;
}

function Orders() {
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
  const {id}=useParams();
  const {data,error}=useData<OrderDetail>('/orders/'+id);
  if (error) return <ErrorText message={error}/>;
  if (!data) return <Loading/>;
  return <div className="inner receipt">
    <Breadcrumb><Link to="/orders">Orders</Link><span>/</span>#{data.id}</Breadcrumb>
    <div className="receipt-header"><span className="receipt-check"><Check size={22}/></span><div><h1>Payment successful</h1><p>Order #{data.id} · {new Date(data.created_at).toLocaleDateString()}</p></div><strong>{money(data.cents)}</strong></div>
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
    <div className="actions receipt-actions"><Link className="button secondary" to="/orders">View orders</Link><Link className="button primary" to="/store">Continue shopping<ArrowRight size={18}/></Link></div>
  </div>;
}

function Protected({children}:{children:ReactNode}) {
  const {user,sessionError}=useMarket();
  if (sessionError) return <><ErrorText message={sessionError}/><Empty title="Sign in to view your orders"><Link className="button primary" to="/login">Sign in</Link></Empty></>;
  if (user===undefined) return <Loading/>;
  if (!user) return <Empty title="Sign in to view your orders"><Link className="button primary" to="/login">Sign in</Link></Empty>;
  return children;
}

function App() {
  const [cart,updateCart]=useState(()=>saved<Item[]>('keyshift.cart',[]));
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
  const {pathname}=useLocation();
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
  useEffect(()=>{window.scrollTo(0,0);},[pathname]);
  useEffect(()=>{if (!toast) return;const timer=setTimeout(()=>setToast(''),3000);return ()=>clearTimeout(timer);},[toast]);
  function setCart(items:Item[]) {localStorage.setItem('keyshift.cart',JSON.stringify(items));updateCart(items);}
  return <MarketContext.Provider value={{cart,setCart,user,setUser,sessionError,notice:setToast,wishlist,toggleWishlist}}>
    <Header/>
    <main className="wrap"><Routes>
      <Route path="/" element={<Home/>}/><Route path="/store" element={<Store/>}/><Route path="/store/:category" element={<Store/>}/><Route path="/wishlist" element={<Wishlist/>}/><Route path="/product/:slug" element={<ProductPage/>}/>
      <Route path="/cart" element={<Cart key="cart"/>}/><Route path="/checkout" element={<Cart key="checkout" checkout/>}/><Route path="/login" element={<Auth key="login"/>}/><Route path="/register" element={<Auth key="register"/>}/>
      <Route path="/orders" element={<Protected><Orders/></Protected>}/><Route path="/orders/:id" element={<Protected><OrderPage/></Protected>}/>
      <Route path="*" element={<Empty title="Page not found"><Link to="/">Return home</Link></Empty>}/>
    </Routes></main>
    <footer><div className="wrap footer-inner"><Brand/><p>Unofficial Eneba internship recreation · Simulated payments</p><Link to="/store">Store <ArrowUpRight size={15}/></Link></div></footer>
    {toast && <div className="toast" role="status"><ShoppingCart size={17}/>{toast} <Link to="/cart">View cart</Link></div>}
  </MarketContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
