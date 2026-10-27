pipeline {
    agent { label 'stockroom' }
    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        skipDefaultCheckout(true)
    }
    parameters {
        booleanParam(name: 'PUBLISH_IMAGES', defaultValue: false,
                     description: 'On main, publish tested images to GHCR.')
        choice(name: 'DEPLOY_TARGET', choices: ['none', 'staging', 'production'],
               description: 'Optional deployment; restricted to main.')
        string(name: 'DEPLOY_IMAGE_TAG', defaultValue: '',
               description: 'Previously published full commit SHA for promotion/rollback. Blank uses this build.')
    }
    environment {
        IMAGE_REPOSITORY = 'shahjahanamu/stockroom-product-crud'
        APP_PORT = '0'
    }
    stages {
        stage('Checkout and prerequisites') {
            steps {
                deleteDir()
                checkout scm
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    env.COMPOSE_PROJECT_NAME = 'stockroom-' + sh(
                        script: 'printf "%s" "$JOB_NAME-$BUILD_NUMBER" | sha256sum | cut -c1-12',
                        returnStdout: true).trim()
                    env.DOCKER_CONFIG = pwd(tmp: true) + '/docker'
                    if ((params.PUBLISH_IMAGES || params.DEPLOY_TARGET != 'none') && env.BRANCH_NAME != 'main') {
                        error('Publishing and deployment are allowed only from the main multibranch job.')
                    }
                    if (params.DEPLOY_IMAGE_TAG && !(params.DEPLOY_IMAGE_TAG ==~ /[0-9a-f]{40}/)) {
                        error('DEPLOY_IMAGE_TAG must be a full lowercase commit SHA.')
                    }
                }
                sh '''
                    node --version
                    java -version
                    python3 --version
                    docker info > /dev/null
                    docker compose version
                    mkdir -p "$DOCKER_CONFIG"
                '''
            }
        }
        stage('CI checks') {
            parallel {
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            sh 'npm ci && npm run build'
                            sh 'npm test -- --watch=false --browsers=ChromeHeadless'
                        }
                    }
                }
                stage('Backend') {
                    steps {
                        dir('backend') { sh 'sh mvnw -B verify' }
                    }
                    post {
                        always { junit 'backend/target/surefire-reports/*.xml' }
                    }
                }
                stage('Container integration') {
                    steps {
                        sh '''
                            docker compose up --build -d
                            address=$(docker compose port frontend 80)
                            python3 scripts/smoke.py "http://127.0.0.1:${address##*:}"
                        '''
                    }
                    post { always { sh 'docker compose logs --no-color' } }
                }
            }
        }
        stage('Publish tested images') {
            when {
                expression {
                    env.BRANCH_NAME == 'main' && !params.DEPLOY_IMAGE_TAG &&
                        (params.PUBLISH_IMAGES || params.DEPLOY_TARGET != 'none')
                }
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'stockroom-ghcr',
                                  usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                    sh '''
                        set +x
                        printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin
                        for service in backend frontend; do
                            image=$(docker compose images -q "$service")
                            test -n "$image"
                            tag="ghcr.io/$IMAGE_REPOSITORY/stockroom-$service:$IMAGE_TAG"
                            docker tag "$image" "$tag"
                            docker push "$tag"
                        done
                    '''
                }
            }
        }
        stage('Approve production') {
            when { expression { env.BRANCH_NAME == 'main' && params.DEPLOY_TARGET == 'production' } }
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    input message: 'Deploy the selected image SHA to production?',
                          submitter: 'stockroom-release-managers'
                }
            }
        }
        stage('Deploy') {
            when { expression { env.BRANCH_NAME == 'main' && params.DEPLOY_TARGET != 'none' } }
            steps {
                script {
                    def target = params.DEPLOY_TARGET
                    if (!(target in ['staging', 'production'])) { error('Invalid deployment target.') }
                    withEnv(["TARGET=${target}", "IMAGE_TAG=${params.DEPLOY_IMAGE_TAG ?: env.IMAGE_TAG}"]) {
                        withCredentials([
                            sshUserPrivateKey(credentialsId: "stockroom-${target}-ssh",
                                              keyFileVariable: 'SSH_KEY', usernameVariable: 'DEPLOY_USER'),
                            string(credentialsId: "stockroom-${target}-host", variable: 'DEPLOY_HOST'),
                            file(credentialsId: "stockroom-${target}-known-hosts", variable: 'SSH_KNOWN_HOSTS')
                        ]) {
                            sh 'bash scripts/jenkins-deploy.sh'
                        }
                    }
                }
            }
        }
    }
    post {
        always {
            sh '''
                if [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
                    docker compose down --volumes || true
                fi
                if [ -n "${DOCKER_CONFIG:-}" ]; then
                    docker logout ghcr.io || true
                    rm -f "$DOCKER_CONFIG/config.json"
                fi
            '''
        }
    }
}
