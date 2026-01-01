function Home() {
	return (
		<div className="min-h-screen bg-white text-black font-serif">
			{/* Navigation */}
			<nav className="border-b border-black/10">
				<div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
					<h1 className="text-4xl font-besley font-bold">1six</h1>
					<div className="flex gap-8 font-sans text-sm">
						<a
							href="#products"
							className="hover:text-gray-600 transition-colors"
						>
							Products
						</a>
						<a href="#about" className="hover:text-gray-600 transition-colors">
							About
						</a>
					</div>
				</div>
			</nav>

			{/* Hero Section */}
			<header className="max-w-7xl mx-auto px-6 py-24 md:py-32">
				<div className="max-w-4xl">
					<h2 className="text-5xl md:text-7xl font-bold leading-tight mb-8">
						Web3 is <s>fucking</s> awesome.
					</h2>
					<p className="text-xl md:text-2xl text-gray-700 font-sans max-w-2xl leading-relaxed">
						So awesome that it should be easy and accessible for everyone on the
						planet. We're building the infrastructure to make that happen.
					</p>
				</div>
			</header>

			{/* About Section */}
			<section id="about" className="bg-black text-white">
				<div className="max-w-7xl mx-auto px-6 py-24">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
						<div>
							<h3 className="text-4xl md:text-5xl font-bold mb-6">
								Leading web3 to cross the chasm
							</h3>
							<p className="text-gray-400 font-sans text-lg leading-relaxed">
								We're building the infrastructure and applications that will
								bring web3 to the masses. No compromises on security, usability,
								or decentralization.
							</p>
						</div>
						<div className="space-y-6 font-sans">
							<div className="border-l-2 border-white pl-6">
								<h4 className="text-xl font-bold mb-2">Our Mission</h4>
								<p className="text-gray-400">
									Make web3 accessible to everyone on the planet through
									intuitive tools and infrastructure.
								</p>
							</div>
							<div className="border-l-2 border-white pl-6">
								<h4 className="text-xl font-bold mb-2">Our Approach</h4>
								<p className="text-gray-400">
									Protocol-first development with a focus on developer
									experience and end-user simplicity.
								</p>
							</div>
							<div className="border-l-2 border-white pl-6">
								<h4 className="text-xl font-bold mb-2">Our Values</h4>
								<p className="text-gray-400">
									Transparency, security, and accessibility in everything we
									build.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Products Section */}
			<section id="products" className="max-w-7xl mx-auto px-6 py-24">
				<div className="mb-16">
					<h3 className="text-4xl md:text-5xl font-bold mb-4">Our Products</h3>
					<p className="text-xl text-gray-600 font-sans">
						Building the foundational infrastructure for the next generation of
						web3.
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					{/* Perpdex.tv */}
					<div className="border border-black/20 p-8 hover:border-black hover:shadow-2xl transition-all group rounded-none">
						<div className="mb-6">
							<div className="w-16 h-16 bg-gradient-to-br from-black to-gray-600 text-white flex items-center justify-center text-2xl font-bold mb-4">
								P
							</div>
							<h4 className="text-2xl font-bold mb-2">perpdex.tv</h4>
							<p className="text-gray-600 font-sans text-sm mb-6 leading-relaxed">
								Making perpdex trading into an esport. Watch, learn, and compete
								with the best traders in the world.
							</p>
						</div>
						<div className="space-y-3 mb-8 font-sans text-sm">
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Trading Esports</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Live Competitions</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Spectator Mode</span>
							</div>
						</div>
						<div className="flex gap-3 justify-center">
							<a
								href="https://perpdex.tv"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Website"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 919-9"
									/>
								</svg>
							</a>
							<a
								href="https://www.youtube.com/@perpdex_tv"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="YouTube"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
								</svg>
							</a>
							<a
								href="https://x.com/perpdextv"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Twitter"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
								</svg>
							</a>
							<a
								href="https://discord.gg/wR4srtyhuU"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Discord"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
								</svg>
							</a>
						</div>
					</div>

					{/* Nevada */}
					{/* <div className="border border-black/20 p-8 hover:border-black hover:shadow-2xl transition-all group rounded-none">
						<div className="mb-6">
							<div className="w-16 h-16 border-2 border-black text-black flex items-center justify-center text-2xl font-bold mb-4">
								N
							</div>
							<h4 className="text-2xl font-bold mb-2">Nevada</h4>
							<p className="text-gray-600 font-sans text-sm mb-6 leading-relaxed">
								Decentralized finance application with special focus on perpdex.
								Your gateway to advanced DeFi trading strategies.
							</p>
						</div>
						<div className="space-y-3 mb-8 font-sans text-sm">
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">DeFi Platform</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Perpdex Focused</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Advanced Trading</span>
							</div>
						</div>
						<div className="flex gap-3 justify-center">
							<a
								href="https://nevadadex.com"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Website"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 919-9"
									/>
								</svg>
							</a>
							<a
								href="https://x.com/nevadadex"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Twitter"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
								</svg>
							</a>
							<a
								href="https://t.me/nevadadex"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Telegram"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
								</svg>
							</a>
						</div>
					</div> */}

					{/* Mojave */}
					{/* <div className="border border-black/20 p-8 hover:border-black hover:shadow-2xl transition-all group rounded-none">
						<div className="mb-6">
							<div className="w-16 h-16 bg-black text-white flex items-center justify-center text-2xl font-bold mb-4">
								M
							</div>
							<h4 className="text-2xl font-bold mb-2">Mojave</h4>
							<p className="text-gray-600 font-sans text-sm mb-6 leading-relaxed">
								Bitcoin ZK Layer 2 focused on unlocking Bitcoin liquidity.
								Bringing the world's largest store of value to DeFi.
							</p>
						</div>
						<div className="space-y-3 mb-8 font-sans text-sm">
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Bitcoin Layer 2</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Zero-Knowledge Proofs</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-1.5 h-1.5 bg-black rounded-full"></div>
								<span className="text-gray-700">Liquidity unlock</span>
							</div>
						</div>
						<div className="flex gap-3 justify-center">
							<a
								href="https://x.com/mojavezk"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Twitter"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
								</svg>
							</a>
							<a
								href="https://t.me/mojavezk"
								target="_blank"
								rel="noopener noreferrer"
								className="w-12 h-12 border border-black/20 hover:bg-black hover:text-white transition-all flex items-center justify-center rounded-none"
								aria-label="Telegram"
							>
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
								</svg>
							</a>
						</div>
					</div> */}
				</div>
			</section>

			{/* Footer */}
			<footer
				id="contact"
				className="bg-black text-white border-t border-white/10"
			>
				<div className="max-w-7xl mx-auto px-6 py-12">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-12">
						<div>
							<h5 className="text-2xl font-besley font-bold mb-4">1six</h5>
							<p className="text-gray-400 font-sans text-sm">
								Building the future of web3 infrastructure.
							</p>
						</div>
						<div>
							<h6 className="font-sans font-bold text-sm uppercase tracking-wider mb-4">
								Products
							</h6>
							<ul className="space-y-2 font-sans text-sm text-gray-400">
								<li>
									<a
										href="https://perpdex.tv"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										perpdex.tv
									</a>
								</li>
								{/* <li>
									<a
										href="https://nevadadex.com"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										Nevada
									</a>
								</li>
								<li>
									<a
										href="https://x.com/mojavezk"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										Mojave
									</a>
								</li> */}
							</ul>
						</div>
						<div>
							<h6 className="font-sans font-bold text-sm uppercase tracking-wider mb-4">
								Connect
							</h6>
							<ul className="space-y-2 font-sans text-sm text-gray-400">
								<li>
									<a
										href="https://x.com/1sixtech"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										Twitter
									</a>
								</li>
								<li>
									<a
										href="https://github.com/1sixtech"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										GitHub
									</a>
								</li>
								<li>
									<a
										href="https://discord.gg/wR4srtyhuU"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										Discord
									</a>
								</li>
							</ul>
						</div>
					</div>
					<div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-gray-400 font-sans">
						© 2025 1six Technologies Inc. All rights reserved.
					</div>
				</div>
			</footer>
		</div>
	);
}

export default Home;
