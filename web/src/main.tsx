import { useEffect, useState, createContext, useContext } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleUserRound, Gamepad2, KeyRound, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Zap } from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import './style.css';

type Product = {id:number; slug:string; name:string; platform:string; region:string; genre:string; description:string; activation:string; artwork:string; cents:number|null};
type Offer = {id:number; seller:string; cents:number; stock:number};
type Item = {offer:number; quantity:number; name:string; seller:string; cents:number; slug:string};
type User = {email:string};
type Order = {id:number; cents:number; created_at:string};
type OrderDetail = Order & {items:{product:string; seller:string; cents:number; quantity:number; keys:string[]}[]};
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
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error || 'Request failed.',response.status);
  return data as T;
}

function useData<T>(path:string): {data?:T; error?:string} {
  const [result,setResult] = useState<{path:string; data?:T; error?:string}>({path:''});
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path,undefined,controller.signal).then(data => setResult({path,data})).catch(error => {
      if (!controller.signal.aborted) setResult({path,error:error.message});
    });
    return () => controller.abort();
  },[path]);
  return result.path === path ? result : {};
}

function saved<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

type Market = {cart:Item[]; setCart:(items:Item[])=>void; user:User|null|undefined; setUser:(u:User|null)=>void; sessionError:string; notice:(s:string)=>void};
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

function Header() {
  const {cart,user} = useMarket();
  const navigate = useNavigate();
  const {pathname,search} = useLocation();
  const query = pathname === '/store' ? new URLSearchParams(search).get('q') ?? '' : '';
  const [value,setValue] = useState(query);
  useEffect(() => setValue(query),[query,pathname]);
  function submit(e:FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) params.set('q',value.trim());
    navigate('/store'+(params.size ? '?'+params : ''));
  }
  return <header className="site-header">
    <div className="wrap nav">
      <Link className="brand" to="/" aria-label="Keyshift home"><span className="mark"><Zap size={20} fill="currentColor"/></span>keyshift<span>.</span></Link>
      <Link className="store-nav" to="/store">Store</Link>
      <form className="search" onSubmit={submit} role="search">
        <Search size={19}/><input aria-label="Search games" placeholder="Search games, platforms and more" value={value} onChange={e=>setValue(e.target.value)} maxLength={100}/>
        <button aria-label="Submit search"><ArrowRight size={17}/></button>
      </form>
      <div className="utilities">
        <Link to={user ? '/orders' : '/login'} aria-label={user ? 'Your orders' : 'Sign in'}><CircleUserRound size={22}/><span>{user ? 'Orders' : 'Sign in'}</span></Link>
        <Link className="bag" to="/cart" aria-label={`Cart, ${cart.reduce((sum,i)=>sum+i.quantity,0)} items`}><ShoppingBag size={20}/><b>{cart.reduce((sum,i)=>sum+i.quantity,0)}</b></Link>
      </div>
    </div>
  </header>;
}

function Card({product}:{product:Product}) {
  return <Link className="card" to={'/product/'+product.slug}>
    <div className={'poster tone-'+product.id%6}>
      <span className="poster-fallback" aria-hidden="true">{product.name}</span>
      <img src={product.artwork} alt="" loading="lazy" onError={e=>e.currentTarget.hidden=true}/>
      <span className="tag">{product.platform}</span>
    </div>
    <div className="card-body"><div className="eyebrow region">{product.region}</div><h3>{product.name}</h3>
      <div className="card-bottom"><div>{product.cents === null ? <span>Out of stock</span> : <><small>From</small><strong>{money(product.cents)}</strong></>}</div><span className="card-arrow"><ArrowUpRight size={17}/></span></div>
    </div>
  </Link>;
}

function Collection({path}:{path:string}) {
  const {data,error} = useData<{title:string;label:string;browse_path:string;items:Product[]}>('/home/'+path);
  return <section className="collection">
    {error ? <ErrorText message={error}/> : !data ? <Loading/> : <>
      <div className="section-heading"><div><div className="eyebrow section-kicker">{data.label}</div><h2>{data.title}</h2></div><Link to={data.browse_path}>Browse store <ArrowUpRight size={17}/></Link></div>
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
        <a className="hero-down" href="#market" aria-label="Scroll to games"><ArrowDown size={19}/></a>
      </>}
    </section>
    <div className="benefits" id="market">
      <span><ShieldCheck size={19}/>Compare seller offers</span><span><Zap size={18}/>Instant demo key delivery</span><span><Gamepad2 size={20}/>Games across platforms</span>
    </div>
    <Collection path="bestsellers"/>
    <Collection path="deals"/>
  </>;
}

function Store() {
  const [params,setParams] = useSearchParams();
  const {data,error} = useData<{items:Product[]; total:number; pageSize:number}>('/products?'+params);
  const filters = useData<{platforms:string[];regions:string[]}>('/filters');
  const page = Number(params.get('page') || '1');
  const query = params.get('q') || '';
  const update = (key:string,value:string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  return <div className="inner">
    <Breadcrumb>Store</Breadcrumb><div className="eyebrow section-kicker">THE MARKETPLACE</div>
    <h1>{query ? `Results for “${query}”` : 'Explore the store'}</h1>
    <div className="store-layout">
      <aside className="filters"><h2><SlidersHorizontal size={18}/> Filters</h2>
        {filters.error && <ErrorText message={filters.error}/>}
        <label>Platform<select value={params.get('platform')||''} onChange={e=>update('platform',e.target.value)}><option value="">All platforms</option>{filters.data?.platforms.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Region<select value={params.get('region')||''} onChange={e=>update('region',e.target.value)}><option value="">All regions</option>{filters.data?.regions.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Maximum price<select value={params.get('max')||''} onChange={e=>update('max',e.target.value)}><option value="">Any price</option>{[500,1000,2000,3000,5000].map(v=><option key={v} value={v}>{money(v)}</option>)}</select></label>
        <button className="button secondary" onClick={()=>setParams(query ? {q:query} : {})}>Clear filters</button>
      </aside>
      <div className="results">
        <div className="result-head"><span>{data ? `${data.total} ${data.total===1?'product':'products'}` : 'Products'}</span>
          <label>Sort by <select value={params.get('sort')||''} onChange={e=>update('sort',e.target.value)}><option value="">Relevance</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option></select></label></div>
        {error ? <ErrorText message={error}/> : !data ? <Loading/> : data.items.length ? <div className="grid store-grid">{data.items.map(p=><Card key={p.id} product={p}/>)}</div> : <Empty title="No products found"><p>Try a different search or clear the filters.</p><button className="button secondary" onClick={()=>setParams({})}>Show all games</button></Empty>}
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
      <div className={'poster detail-art tone-'+data.id%6}><span className="poster-fallback">{data.name}</span><img src={data.artwork} alt="" onError={e=>e.currentTarget.hidden=true}/></div>
      <div><div className="eyebrow section-kicker">{data.genre}</div><h1>{data.name}</h1>
        <div className="pills"><span><Gamepad2 size={17}/>{data.platform}</span><span>{data.region}</span><span><KeyRound size={16}/>Digital key</span></div>
        <p className="description">{data.description}</p><details><summary>Activation information</summary><p>{data.activation} This demo provides sample keys only.</p></details>
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
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const next=params.get('next')==='cart' ? '/cart' : '/orders';
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');setBusy(true);
    const form=new FormData(e.currentTarget);
    try {
      setUser(await api<User>(register?'/register':'/login',{email:form.get('email'),password:form.get('password')}));
      navigate(next,{replace:true});
    } catch (err) {setError((err as Error).message);}
    finally {setBusy(false);}
  }
  return <section className="form-panel"><span className="mark"><KeyRound size={20}/></span><h1>{register?'Create account':'Sign in'}</h1>
    {error&&<ErrorText message={error}/>}
    <form onSubmit={submit}><label>Email<input type="email" name="email" autoComplete="email" required maxLength={254}/></label>
      <label>Password<input type="password" name="password" required minLength={8} maxLength={72} autoComplete={register?'new-password':'current-password'}/></label>
      <button className="button primary" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
    </form>
    <p>{register?'Already registered?':'New to Keyshift?'} <Link to={(register?'/login':'/register')+(next==='/cart'?'?next=cart':'')}>{register?'Sign in':'Create an account'}</Link></p>
  </section>;
}

function Cart() {
  const {cart,setCart,user,sessionError}=useMarket();
  const [payment,setPayment]=useState('success');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const navigate=useNavigate();
  const total=cart.reduce((sum,i)=>sum+i.quantity*i.cents,0);
  function quantity(offer:number,value:number) {
    if (!Number.isInteger(value) || value<1 || value>20) return;
    setCart(cart.map(i=>i.offer===offer?{...i,quantity:value}:i));
  }
  async function buy() {
    setBusy(true);setError('');
    const items=cart.map(({offer,quantity})=>({offer,quantity})).sort((a,b)=>a.offer-b.offer);
    const fingerprint=JSON.stringify({email:user?.email,items,payment});
    const pending=saved<{fingerprint:string;id:string}|null>('keyshift.checkout',null);
    const id=pending?.fingerprint===fingerprint ? pending.id : crypto.randomUUID();
    localStorage.setItem('keyshift.checkout',JSON.stringify({fingerprint,id}));
    try {
      const order=await api<{id:number}>('/checkout',{items,payment,requestId:id});
      setCart([]);
      localStorage.removeItem('keyshift.checkout');
      navigate('/orders/'+order.id+'?confirmed=1',{replace:true});
    } catch (err) {
      if (err instanceof RequestError && err.status===401) navigate('/login?next=cart');
      else setError((err as Error).message);
    } finally {setBusy(false);}
  }
  return <div className="inner"><Breadcrumb>Cart</Breadcrumb><h1>Your cart</h1>
    {!cart.length ? <Empty title="Your cart is empty"><Link className="button primary" to="/store">Browse games<ArrowRight size={18}/></Link></Empty> :
      <div className="cart-layout"><div className="cart-items">{cart.map(i=><div className="cart-row" key={i.offer}>
        <div><Link to={'/product/'+i.slug}><strong>{i.name}</strong></Link><small>{i.seller} · {money(i.cents)} each</small></div>
        <label>Qty<input aria-label={i.name+' quantity'} type="number" min={1} max={20} value={i.quantity} disabled={busy} onChange={e=>quantity(i.offer,e.target.valueAsNumber)}/></label>
        <button className="text-button" disabled={busy} onClick={()=>setCart(cart.filter(x=>x.offer!==i.offer))}>Remove</button>
      </div>)}</div><aside className="summary"><h2>Order summary</h2><div className="sum"><span>Estimated total</span><strong>{money(total)}</strong></div>
      <p>Simulated payment. Your order will contain demo keys only.</p>
      {sessionError && <ErrorText message={sessionError}/>}
      {user ? <><label>Payment outcome<select disabled={busy} value={payment} onChange={e=>setPayment(e.target.value)}><option value="success">Simulate approval</option><option value="failure">Simulate decline</option></select></label>
      {error && <ErrorText message={error}/>}<button className="button primary" disabled={busy} onClick={buy}>{busy?'Processing…':'Place demo order'}<ArrowRight size={18}/></button></> :
      user===undefined ? <Loading/> : <Link className="button primary" to="/login?next=cart">Sign in to checkout<ArrowRight size={18}/></Link>}
      </aside></div>}
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

function OrderPage() {
  const {id}=useParams();
  const [params]=useSearchParams();
  const {data,error}=useData<OrderDetail>('/orders/'+id);
  if (error) return <ErrorText message={error}/>;
  if (!data) return <Loading/>;
  return <div className="inner"><Breadcrumb><Link to="/orders">Orders</Link><span>/</span>#{data.id}</Breadcrumb>
    <div className="eyebrow section-kicker"><Check size={17}/> PAYMENT SIMULATED</div>
    <h1>{params.has('confirmed')?'Order confirmed':`Order #${data.id}`}</h1>
    <p>{money(data.cents)} · {new Date(data.created_at).toLocaleDateString()} · Demo keys</p>
    <div className="order-list">{data.items.map((i,index)=><article className="key-card" key={index}>
      <h2>{i.product}</h2><p>{i.seller} · {i.quantity} × {money(i.cents)}</p>
      {i.keys.map(k=><code key={k}>{k}</code>)}
    </article>)}</div>
    <Link className="button secondary inline" to="/orders"><ArrowLeft size={17}/> Order history</Link>
  </div>;
}

function Protected({children}:{children:ReactNode}) {
  const {user,sessionError}=useMarket();
  if (sessionError) return <ErrorText message={sessionError}/>;
  if (user===undefined) return <Loading/>;
  if (!user) return <Empty title="Sign in to view your orders"><Link className="button primary" to="/login">Sign in</Link></Empty>;
  return children;
}

function App() {
  const [cart,updateCart]=useState(()=>saved<Item[]>('keyshift.cart',[]));
  const [user,setUser]=useState<User|null>();
  const [sessionError,setSessionError]=useState('');
  const [toast,setToast]=useState('');
  const {pathname}=useLocation();
  useEffect(()=>{api<User|null>('/session').then(setUser).catch(e=>setSessionError(e.message));},[]);
  useEffect(()=>{window.scrollTo(0,0);},[pathname]);
  useEffect(()=>{if (!toast) return;const timer=setTimeout(()=>setToast(''),3000);return ()=>clearTimeout(timer);},[toast]);
  function setCart(items:Item[]) {localStorage.setItem('keyshift.cart',JSON.stringify(items));updateCart(items);}
  return <MarketContext.Provider value={{cart,setCart,user,setUser,sessionError,notice:setToast}}>
    <Header/>
    <main className="wrap"><Routes>
      <Route path="/" element={<Home/>}/><Route path="/store" element={<Store/>}/><Route path="/product/:slug" element={<ProductPage/>}/>
      <Route path="/cart" element={<Cart/>}/><Route path="/login" element={<Auth key="login"/>}/><Route path="/register" element={<Auth key="register"/>}/>
      <Route path="/orders" element={<Protected><Orders/></Protected>}/><Route path="/orders/:id" element={<Protected><OrderPage/></Protected>}/>
      <Route path="*" element={<Empty title="Page not found"><Link to="/">Return home</Link></Empty>}/>
    </Routes></main>
    <footer><div className="wrap footer-inner"><Link to="/" className="brand"><span className="mark"><Zap size={18} fill="currentColor"/></span>keyshift<span>.</span></Link><p>Internship demo · Simulated payments and demo keys</p><Link to="/store">Store <ArrowUpRight size={15}/></Link></div></footer>
    {toast && <div className="toast" role="status"><ShoppingBag size={17}/>{toast} <Link to="/cart">View cart</Link></div>}
  </MarketContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
