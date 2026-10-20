# Builds both images in one BuildKit run so they share the dependency and build stages.
variable "NS"  { default = "awsmallick1999" }
variable "TAG" { default = "dev" }

group "default" { targets = ["api", "web"] }

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64"]
}
target "api" {
  inherits = ["_common"]
  target   = "api"
  tags     = ["${NS}/sahaj-api:${TAG}"]
}
target "web" {
  inherits = ["_common"]
  target   = "web"
  tags     = ["${NS}/sahaj-web:${TAG}", "${NS}/sahaj-web:latest"]
}
