Pod::Spec.new do |s|
  s.name           = 'LlPassKit'
  s.version        = '0.1.0'
  s.summary        = 'Apple Wallet add-pass flow for Local Loyalty'
  s.description    = 'PKAddPassButton and PKAddPassesViewController for a signed .pkpass URL (local Expo module).'
  s.author         = 'Local Loyalty'
  s.homepage       = 'https://localloyalty.example'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'PassKit'
  s.source_files   = '**/*.{h,m,swift}'
end
