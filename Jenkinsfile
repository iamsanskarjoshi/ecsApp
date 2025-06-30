pipeline {
    options {
        buildDiscarder(logRotator(numToKeepStr: '3'))
        timeout(time: 30, unit: 'MINUTES')
        skipStagesAfterUnstable()
    }
    
    agent any
    
    environment {
        // ECR Configuration - Updated to eu-west-1 to match ALB
        AWS_REGION = 'eu-west-1'
        ECR_REGISTRY = '<enter-your-aws-account-id>.dkr.ecr.eu-west-1.amazonaws.com'
        IMAGE_NAME = 'sampleApp'
        IMAGE_TAG = "${BUILD_NUMBER}"
        
        // ECS Configuration
        ECS_CLUSTER = 'enter cluster name'
        ECS_SERVICE = '<enter service name>'
        ECS_TASK_DEFINITION = 'enter task definition'
    }
    
    stages {
        stage('Docker Build') {
            steps {
                script {
                    echo "Building Docker image..."
                    
                    // Build Docker image
                    sh """
                        docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} .
                    """
                    
                    // List images
                    sh "docker images | grep ${IMAGE_NAME}"
                }
            }
        }
        
        stage('Push to ECR') {
            steps {
                script {
                    echo "Pushing image to ECR..."
                    
                    // Login to ECR
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """
                    
                    // Push images
                    sh """
                        docker push ${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                    """
                }
            }
        }
        
        stage('Update Task Definition') {
            steps {
                script {
                    echo "Updating ECS Task Definition..."
                    
                    // Get current task definition
                    sh """
                        aws ecs describe-task-definition \
                            --task-definition ${ECS_TASK_DEFINITION} \
                            --region ${AWS_REGION} \
                            --query 'taskDefinition' \
                            --output json > current-task-def.json
                    """
                    
                    // Update the image in task definition using jq
                    sh """
                        cat current-task-def.json | \
                        jq --arg IMAGE "${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}" \
                        '.containerDefinitions[0].image = \$IMAGE' | \
                        jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy)' \
                        > updated-task-def.json
                    """
                    
                    // Register new task definition
                    sh """
                        aws ecs register-task-definition \
                            --cli-input-json file://updated-task-def.json \
                            --region ${AWS_REGION}
                    """
                }
            }
        }
        
        stage('Deploy to ECS') {
            steps {
                script {
                    echo "Deploying to ECS..."
                    
                    // Update ECS service with new task definition
                    sh """
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE} \
                            --task-definition ${ECS_TASK_DEFINITION} \
                            --force-new-deployment \
                            --region ${AWS_REGION}
                    """
                    
                    // Wait for deployment to complete
                    sh """
                        aws ecs wait services-stable \
                            --cluster ${ECS_CLUSTER} \
                            --services ${ECS_SERVICE} \
                            --region ${AWS_REGION}
                    """
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "Cleaning up..."
                // Clean up Docker images
                sh """
                    docker rmi -f ${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} || true
                    docker rmi -f ${IMAGE_NAME}:${IMAGE_TAG} || true
                """
                
                // Clean up temporary files
                sh """
                    rm -f current-task-def.json updated-task-def.json || true
                """
            }
        }
        
        success {
            script {
                echo "Pipeline completed successfully!"
                echo "New image deployed: ${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }
        
        failure {
            script {
                echo "Pipeline failed!"
                // Optionally rollback to previous task definition
                sh """
                    echo "Consider rolling back if needed"
                """
            }
        }
    }
}